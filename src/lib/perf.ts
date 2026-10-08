import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

interface Span { dbCalls: number; redisCalls: number; parent?: Span }
const active = new AsyncLocalStorage<Span>();
export function recordDatabaseCall() {
  for (let span = active.getStore(); span; span = span.parent) span.dbCalls++;
}
export function recordRedisCall() {
  for (let span = active.getStore(); span; span = span.parent) span.redisCalls++;
}

/** Opt-in server timings. Labels are fixed; never include account or query data. */
export async function timed<T>(operation: string, read: () => Promise<T>): Promise<T> {
  if (process.env.PERF_TRACE !== "1") return read();
  if (operation.startsWith("redis.")) recordRedisCall();
  const started = performance.now();
  const span: Span = { dbCalls: 0, redisCalls: 0, parent: active.getStore() };
  return active.run(span, async () => {
    try { return await read(); }
    finally { console.info(JSON.stringify({ event: "server_timing", operation,
      ms: Math.round(performance.now() - started), dbCalls: span.dbCalls, redisCalls: span.redisCalls })); }
  });
}
