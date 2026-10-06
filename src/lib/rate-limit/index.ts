import "server-only";
import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
const local = new Map<string, { count: number; expires: number }>();
/** Fixed-window counters use one atomic Redis script across Vercel instances. */
export async function allowRequest(identifier: string, maximum = 5, seconds = 60): Promise<boolean> {
  const env = getEnv();
  const key = `studyflow:limit:${createHash("sha256").update(identifier).digest("hex")}:${Math.floor(Date.now() / (seconds * 1000))}`;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const response = await fetch(env.UPSTASH_REDIS_REST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(["EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, key, seconds]), cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const result: { result?: unknown } = await response.json();
    return typeof result.result === "number" && result.result <= maximum;
  }
  if (process.env.NODE_ENV === "production") return false;
  for (const [name, row] of local) if (row.expires < Date.now()) local.delete(name);
  const row = local.get(key) ?? { count: 0, expires: Date.now() + seconds * 1000 };
  row.count++; local.set(key, row);
  return row.count <= maximum;
}
