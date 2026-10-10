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
export type LimitDecision = "allowed" | "limited" | "unavailable";
/** Security stays fail closed; outages must not be described as excess requests. */
export async function requestLimit(identifier: string, maximum = 5, seconds = 60): Promise<LimitDecision> {
  const key = createHash("sha256").update(identifier).digest("hex");
  try {
    const redis = rateLimitRedis();
    if (redis) {
      const family = `${maximum}:${seconds}`;
      let limiter = limiters.get(family);
      if (!limiter) { limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(maximum, `${seconds} s`), prefix: `${rateLimitPrefix()}:${family}`, timeout: 1500, ephemeralCache: false, analytics: false }); limiters.set(family, limiter); }
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await limiter.limit(key);
          if (result.reason !== "timeout") {
            if (attempt) console.info(JSON.stringify({ event: "rate_limit_verification_recovered" }));
            return result.success ? "allowed" : "limited";
          }
          if (attempt) { console.warn(JSON.stringify({ event: "rate_limit_unavailable", category: "timeout" })); return "unavailable"; }
        } catch {
          if (attempt) { console.warn(JSON.stringify({ event: "rate_limit_unavailable", category: "connection" })); return "unavailable"; }
        }
        // Retry only the security decision, before any database mutation. An
        // uncertain first increment can consume an extra slot; never bypass it.
      }
      return "unavailable";
    }
    if (process.env.NODE_ENV !== "development") return "unavailable";
    const now = Date.now(), cutoff = now - seconds * 1000;
    for (const [name, times] of local) if ((times.at(-1) ?? 0) <= cutoff) local.delete(name);
    const times = (local.get(key) ?? []).filter(time => time > cutoff);
    if (times.length >= maximum) return "limited";
    times.push(now); local.set(key, times);
    return "allowed";
  } catch { console.warn(JSON.stringify({ event: "rate_limit_unavailable", category: "connection" })); return "unavailable"; }
}
export async function allowRequest(identifier: string, maximum = 5, seconds = 60): Promise<boolean> { return await requestLimit(identifier, maximum, seconds) === "allowed"; }
