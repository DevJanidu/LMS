import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ data: new Map<string, unknown>(), available: true, configured: true, admin: vi.fn(async () => ({})) }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ execute: async () => ({ rows: [{ revision: "fixture-revision:3" }] }) }) }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ DATABASE_URL: "postgresql://fixture@database.example.com/app", CACHE_NAMESPACE: "test", UPSTASH_REDIS_REST_URL: mocks.configured ? "https://redis.example.com" : undefined, UPSTASH_REDIS_REST_TOKEN: mocks.configured ? "test-token" : undefined }) }));
vi.mock("@upstash/redis", () => {
  const check = () => { if (!mocks.available) throw new Error("unreachable"); };
  return { Redis: class {
    async get(key: string) { check(); return mocks.data.get(key) ?? null; }
    async mget(...keys: string[]) { check(); return keys.map(key => mocks.data.get(key) ?? null); }
    async set(key: string, value: unknown, options?: { nx?: boolean }) { check(); if (options?.nx && mocks.data.has(key)) return null; mocks.data.set(key, structuredClone(value)); return "OK"; }
    async eval(_script: string, keys: string[], args: string[]) { check(); if (mocks.data.get(keys[0]) === args[0]) mocks.data.delete(keys[0]); }
    pipeline() { const pairs: [string, unknown][] = []; const pipeline = { set(key: string, value: unknown) { pairs.push([key, value]); return pipeline; }, async exec() { check(); for (const [key, value] of pairs) mocks.data.set(key, value); } }; return pipeline; }
  } };
});
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
beforeEach(() => { vi.resetModules(); mocks.data.clear(); mocks.available = true; mocks.configured = true; mocks.admin.mockReset().mockResolvedValue({}); });
it("separates learners and includes their IDs in every learner key", async () => {
  const { cachedUser } = await import("@/lib/cache");
  const first = vi.fn(async () => ({ seconds: 10 })), second = vi.fn(async () => ({ seconds: 20 }));
  expect(await cachedUser(a, "analytics", "UTC:2026-10-07", 60, first)).toEqual({ seconds: 10 });
  expect(await cachedUser(b, "analytics", "UTC:2026-10-07", 60, second)).toEqual({ seconds: 20 });
  expect(await cachedUser(a, "analytics", "UTC:2026-10-07", 60, second)).toEqual({ seconds: 10 });
  expect(first).toHaveBeenCalledTimes(1);
  expect([...mocks.data.keys()].every(key => key.includes(`:u:${a}:`) || key.includes(`:u:${b}:`))).toBe(true);
});
it("invalidates each family and fences an older in-flight read", async () => {
  const { cachedUser, invalidateUser } = await import("@/lib/cache");
  let resolveOld!: (value: number) => void;
  const old = cachedUser(a, "analytics", "summary", 60, () => new Promise<number>(resolve => { resolveOld = resolve; }));
  await vi.waitFor(() => expect(resolveOld).toBeDefined());
  await invalidateUser(a, ["analytics", "subjects", "calendar"]);
  expect(await cachedUser(a, "analytics", "summary", 60, async () => 2)).toBe(2);
  resolveOld(1); await old;
  expect(await cachedUser(a, "analytics", "summary", 60, async () => 3)).toBe(2);
  for (const scope of ["subjects", "calendar"] as const) {
    await cachedUser(a, scope, "summary", 60, async () => 1);
    await invalidateUser(a, [scope]);
    expect(await cachedUser(a, scope, "summary", 60, async () => 2)).toBe(2);
  }
});
it("uses database fallback with missing credentials or Redis outage and never caches fetch errors", async () => {
  const { cachedUser } = await import("@/lib/cache");
  mocks.configured = false;
  expect(await cachedUser(a, "analytics", "summary", 60, async () => 7)).toBe(7);
  mocks.configured = true; mocks.available = false;
  expect(await cachedUser(a, "analytics", "summary", 60, async () => 8)).toBe(8);
  expect(mocks.data.size).toBe(0);
  await expect(cachedUser(a, "analytics", "summary", 60, async () => { throw new Error("database unavailable"); })).rejects.toThrow("database unavailable");
  expect(mocks.data.size).toBe(0);
});
it("requires live admin authorization before even reading a cached admin value", async () => {
  const { cachedAdmin } = await import("@/lib/cache");
  await cachedAdmin("kpis", async () => 5);
  mocks.admin.mockRejectedValue(new Error("forbidden"));
  await expect(cachedAdmin("kpis", async () => 6)).rejects.toThrow("forbidden");
});
it("expires at the next local midnight including 23 and 25 hour DST days", async () => {
  const { untilLocalMidnight } = await import("@/lib/cache");
  expect(untilLocalMidnight("America/New_York", Date.parse("2026-03-08T05:00:00Z"))).toBe(23 * 3600);
  expect(untilLocalMidnight("America/New_York", Date.parse("2026-11-01T04:00:00Z"))).toBe(25 * 3600);
  expect(untilLocalMidnight("Asia/Colombo", Date.parse("2026-10-07T18:29:59Z"))).toBe(1);
});
