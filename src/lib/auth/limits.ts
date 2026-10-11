import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

type Decision = "allowed" | "limited" | "unavailable";
export const RESET_WEEK_SECONDS = 7 * 24 * 60 * 60;
export function authLimitKey(identifier: string, maximum: number, seconds: number) {
  return `auth:v1:${maximum}:${seconds}:${createHash("sha256").update(identifier).digest("hex")}`;
}
/** An atomic shared database counter survives cold starts without external Redis. */
export async function requestAuthLimit(identifier: string, maximum = 5, seconds = 60): Promise<Decision> {
  try {
    const now = Date.now(), start = Math.floor(now / (seconds * 1000)) * seconds * 1000;
    const key = authLimitKey(identifier, maximum, seconds);
    const rows = await getDb().insert(rateLimits).values({ key, count: 1, lastRequest: start }).onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`CASE WHEN ${rateLimits.lastRequest} < ${start} THEN 1 ELSE ${rateLimits.count} + 1 END`, lastRequest: start },
      setWhere: sql`${rateLimits.lastRequest} < ${start} OR ${rateLimits.count} < ${maximum}`,
    }).returning({ id: rateLimits.id });
    return rows.length ? "allowed" : "limited";
  } catch { console.warn(JSON.stringify({ event: "auth_rate_limit_unavailable" })); return "unavailable"; }
}
export function resetLimitPrefix(email: string) {
  return `reset-week:v1:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;
}
export type ResetDecision = { decision: Decision; reservation?: string; retryAt?: string };
/** Five timestamped slots enforce an exact rolling seven-day allowance. */
export async function reservePasswordReset(email: string, now = Date.now()): Promise<ResetDecision> {
  const prefix = resetLimitPrefix(email), keys = Array.from({ length: 5 }, (_, index) => `${prefix}:${index}`);
  try {
    return await getDb().transaction(async tx => {
      // A persistent guard row serializes reservations across server instances.
      await tx.insert(rateLimits).values({ key: `${prefix}:guard`, count: 0, lastRequest: now }).onConflictDoUpdate({ target: rateLimits.key, set: { lastRequest: now } });
      const rows = await tx.select().from(rateLimits).where(inArray(rateLimits.key, keys));
      const cutoff = now - RESET_WEEK_SECONDS * 1000;
      const available = keys.find(key => !rows.some(row => row.key === key && row.lastRequest > cutoff));
      if (!available) return { decision: "limited" as const, retryAt: new Date(Math.min(...rows.map(row => row.lastRequest)) + RESET_WEEK_SECONDS * 1000).toISOString() };
      const reservation = crypto.randomUUID();
      await tx.insert(rateLimits).values({ id: reservation, key: available, count: 1, lastRequest: now }).onConflictDoUpdate({ target: rateLimits.key, set: { id: reservation, count: 1, lastRequest: now } });
      return { decision: "allowed" as const, reservation };
    });
  } catch { console.warn(JSON.stringify({ event: "password_reset_limit_unavailable" })); return { decision: "unavailable" }; }
}
/** Only the failed send's reservation is released, never a newer request. */
export async function releasePasswordReset(reservation: string) {
  try { await getDb().delete(rateLimits).where(and(eq(rateLimits.id, reservation), sql`${rateLimits.key} LIKE 'reset-week:v1:%'`)); }
  catch { console.warn(JSON.stringify({ event: "password_reset_limit_release_failed" })); }
}
