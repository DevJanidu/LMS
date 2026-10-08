import "server-only";
import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getEnv } from "@/lib/env";
import { getRedis, rateLimitPrefix } from "@/lib/cache";
const local = new Map<string, number[]>();
const limiters = new Map<string, Ratelimit>();
let securityRedis: Redis | undefined;
function rateLimitRedis() {
  const env = getEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return getRedis();
  // Security cannot fall back to DB. Its separate singleton allows a longer
  // fail-closed deadline than optional cached data (250ms).
  return securityRedis ??= new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, retry: false, signal: () => AbortSignal.timeout(1500) });
}
/** Sliding windows are independent of cached data and fail closed on Redis errors. */
export async function allowRequest(identifier: string, maximum = 5, seconds = 60): Promise<boolean> {
  const key = createHash("sha256").update(identifier).digest("hex");
  try {
    const redis = rateLimitRedis();
    if (redis) {
      const family = `${maximum}:${seconds}`;
      let limiter = limiters.get(family);
      if (!limiter) { limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(maximum, `${seconds} s`), prefix: `${rateLimitPrefix()}:${family}`, timeout: 1500, ephemeralCache: false, analytics: false }); limiters.set(family, limiter); }
      const result = await limiter.limit(key);
      return result.success && result.reason !== "timeout";
    }
    if (process.env.NODE_ENV !== "development") return false;
    const now = Date.now(), cutoff = now - seconds * 1000;
    for (const [name, times] of local) if ((times.at(-1) ?? 0) <= cutoff) local.delete(name);
    const times = (local.get(key) ?? []).filter(time => time > cutoff);
    if (times.length >= maximum) return false;
    times.push(now); local.set(key, times);
    return true;
  } catch { return false; }
}
