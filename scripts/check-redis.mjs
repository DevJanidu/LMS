import { environment as env } from "./env-runtime.mjs";
try {
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(["PING"]), signal: AbortSignal.timeout(5000) });
  const data = await response.json();
  console.info(JSON.stringify({ check: "redis", ok: response.ok && data.result === "PONG", status: response.status }));
  const start = performance.now();
  const limit = await fetch(env.UPSTASH_REDIS_REST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(["EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `lms:audit:probe:${crypto.randomUUID()}`, 60]), signal: AbortSignal.timeout(5000) });
  const result = await limit.json();
  console.info(JSON.stringify({ check: "redis_atomic_counter", status: limit.status, type: typeof result.result, value: typeof result.result === "number" ? result.result : undefined, ms: Math.round(performance.now() - start) }));
} catch { console.info(JSON.stringify({ check: "redis", ok: false, error: "connection_or_timeout" })); process.exitCode = 1; }
