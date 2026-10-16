import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

type Decision = "allowed" | "limited" | "unavailable";
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
