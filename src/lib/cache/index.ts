import "server-only";
import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import { localDay, shiftDay, zonedToUtc } from "@/lib/analytics";
import { timed } from "@/lib/perf";

export type UserCacheScope = "analytics" | "subjects" | "calendar";
interface Envelope<T> { version: 2; value: T }
interface Counts { hit: number; miss: number; bypass: number; error: number }
const counts: Record<string, Counts> = {};
const inFlight = new Map<string, Promise<unknown>>();
let redis: Redis | undefined;
let warned = false;
let connected = false;
let unavailableUntil = 0;

function trace(kind: "HIT" | "MISS" | "SET" | "BYPASS", key: string, family: string) {
  if (process.env.NODE_ENV !== "development") return;
  const owner = key.match(/:u:([a-f0-9-]{36}):/i)?.[1];
  const label = owner ? `${family}:${createHash("sha256").update(owner).digest("hex").slice(0, 8)}` : family;
  console.info(`[cache] ${kind} ${label}`);
}

function markConnected() {
  if (!connected) { connected = true; console.info("[cache] Upstash connected"); }
}

function branchNamespace() {
  const env = getEnv(), endpoint = new URL(env.DATABASE_URL);
  const branch = createHash("sha256").update(endpoint.hostname + endpoint.pathname).digest("hex").slice(0, 12);
  return `${env.CACHE_NAMESPACE}:${branch}`;
}
export function cachePrefix() { return `lms:v2:${branchNamespace()}`; }
export function rateLimitPrefix() { return `lms:security:v1:${branchNamespace()}`; }
export function getRedis(): Redis | undefined {
  const env = getEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    if (!warned && process.env.NODE_ENV === "development") { warned = true; console.warn("[cache] DISABLED: Upstash variables absent; using database reads"); }
    return undefined;
  }
  return redis ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, retry: false, signal: () => AbortSignal.timeout(1500) });
}
function record(family: string, kind: keyof Counts) {
  const row = counts[family] ??= { hit: 0, miss: 0, bypass: 0, error: 0 };
  row[kind]++;
  // Family names are fixed application labels: never log user IDs, keys or errors.
  if (process.env.NODE_ENV === "development" && (row.hit + row.miss + row.bypass + row.error) % 20 === 0) console.info(JSON.stringify({ event: "cache_counts", family, ...row }));
}
export function cacheCounts(): Record<string, Counts> { return structuredClone(counts); }
function failed(family: string) {
  record(family, "error");
  if (unavailableUntil <= Date.now()) console.warn(`[cache] DISABLED: Redis request failed (${family}); using database reads`);
  unavailableUntil = Date.now() + 5000;
}
function checkKey(key: string) {
  if (!key.startsWith(`${cachePrefix()}:`) || /[*?\[\]]/.test(key)) throw new Error("Invalid cache namespace.");
}

/** Values must be computed summaries, never auth, timer, signed URLs or private text. */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, family = "summary"): Promise<T> {
  checkKey(key);
  const client = getRedis();
  if (!client || unavailableUntil > Date.now()) { record(family, "bypass"); trace("BYPASS", key, family); return fetcher(); }
  let stored: Envelope<T> | null;
  try { stored = await timed("redis.get", () => client.get<Envelope<T>>(key)); markConnected(); }
  catch { failed(family); return fetcher(); }
  if (stored?.version === 2) { record(family, "hit"); trace("HIT", key, family); return stored.value; }
  record(family, "miss");
  trace("MISS", key, family);
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const task = (async () => {
    const lockKey = `${key}:lock`, token = crypto.randomUUID();
    let locked = false;
    try { locked = (await client.set(lockKey, token, { nx: true, ex: 10 })) === "OK"; }
    catch { failed(family); }
    if (!locked && unavailableUntil <= Date.now()) {
      // Wait briefly for the lock holder rather than stampeding the aggregate.
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        try { const filled = await client.get<Envelope<T>>(key); if (filled?.version === 2) { record(family, "hit"); return filled.value; } }
        catch { failed(family); break; }
      }
    }
    try {
      // A losing instance reads fresh DB data without publishing over the lock owner.
      const value = await fetcher();
      if (locked && unavailableUntil <= Date.now()) {
        try { await client.set(key, { version: 2, value }, { ex: Math.max(1, Math.floor(ttlSeconds)) }); trace("SET", key, family); }
        catch { failed(family); }
      }
      return value;
    } finally {
      if (locked) {
        try { await client.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", [lockKey], [token]); }
        catch { failed(family); }
      }
    }
  })();
  inFlight.set(key, task);
  try { return await task; } finally { inFlight.delete(key); }
}

const settingsGeneration = () => `${cachePrefix()}:settings:generation`;
const userGeneration = (userId: string, scope: UserCacheScope) => `${cachePrefix()}:u:${userId}:${scope}:generation`;
function checkUser(userId: string) { if (!/^[a-f0-9-]{36}$/i.test(userId)) throw new Error("Invalid cache owner."); }
export async function cachedUser<T>(userId: string, scope: UserCacheScope, suffix: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  checkUser(userId);
  const client = getRedis();
  if (!client || unavailableUntil > Date.now()) { record(scope, "bypass"); return fetcher(); }
  let versions: unknown[];
  try { versions = await timed("redis.generation", () => client.mget(userGeneration(userId, scope), settingsGeneration())); }
  catch { failed(scope); return fetcher(); }
  const generation = versions.map(value => value ?? "0").join(":");
  return cached(`${cachePrefix()}:u:${userId}:${scope}:${generation}:${encodeURIComponent(suffix)}`, ttl, fetcher, scope);
}
/** Admin caller must perform its live requireAdmin/active-role guard before calling. */
export async function cachedAdmin<T>(suffix: string, fetcher: () => Promise<T>): Promise<T> {
  const { requireAdmin } = await import("@/lib/auth");
  await requireAdmin();
  const client = getRedis();
  if (!client || unavailableUntil > Date.now()) return fetcher();
  // The database revision fences summaries even when Redis generation updates
  // fail on a different instance. Counts also fence account deletions.
  const { getDb } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const result = await getDb().execute<{ revision: string }>(sql`SELECT concat(coalesce(max(updated_at)::text, ''), ':', count(*)::text) AS revision FROM users`);
  const revision = result.rows[0].revision;
  let generation: unknown;
  try { generation = await client.get(`${cachePrefix()}:admin:generation`); }
  catch { failed("admin"); return fetcher(); }
  return cached(`${cachePrefix()}:admin:${generation ?? "0"}:${encodeURIComponent(revision)}:${encodeURIComponent(suffix)}`, 120, fetcher, "admin");
}
export async function cachedSettings<T>(fetcher: () => Promise<T>): Promise<T> {
  const client = getRedis();
  if (!client || unavailableUntil > Date.now()) return fetcher();
  let generation: unknown;
  try { generation = await client.get(settingsGeneration()); }
  catch { failed("settings"); return fetcher(); }
  return cached(`${cachePrefix()}:settings:${generation ?? "0"}`, 60, fetcher, "settings");
}
/** Change generations after commit. Old readers cannot refill the new generation. */
export async function invalidateUser(userId: string, scopes: readonly UserCacheScope[]) {
  checkUser(userId);
  const client = getRedis();
  if (!client) return;
  try {
    const pipeline = client.pipeline();
    for (const scope of new Set(scopes)) pipeline.set(userGeneration(userId, scope), crypto.randomUUID());
    pipeline.set(`${cachePrefix()}:admin:generation`, crypto.randomUUID());
    await pipeline.exec();
  } catch { failed("invalidation"); }
}
export async function invalidateSettings() {
  const client = getRedis();
  if (!client) return;
  try { await client.set(settingsGeneration(), crypto.randomUUID()); }
  catch { failed("invalidation"); }
}
export async function invalidate(keys: string[]) {
  keys.forEach(checkKey);
  if (!keys.length) return;
  try { await getRedis()?.del(...keys); } catch { failed("invalidation"); }
}
/** Maintenance only; normal mutation invalidation uses generations, never SCAN. */
export async function invalidateByPrefix(prefix: string) {
  checkKey(prefix);
  if (prefix.length <= cachePrefix().length + 1) throw new Error("Specify a user or family prefix.");
  const client = getRedis();
  if (!client) return;
  try {
    let cursor = "0";
    do {
      const result = await client.scan(cursor, { match: `${prefix}*`, count: 100 });
      cursor = String(result[0]);
      if (result[1].length) await client.del(...result[1]);
    } while (cursor !== "0");
  } catch { failed("invalidation"); }
}
export function untilLocalMidnight(timezone: string, now = Date.now()): number {
  return Math.max(1, Math.ceil((Date.parse(zonedToUtc(`${shiftDay(localDay(now, timezone), 1)}T00:00`, timezone)) - now) / 1000));
}
