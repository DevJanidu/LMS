import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";
import { recordQuery } from "./metrics";
neonConfig.poolQueryViaFetch = true;

/** WebSocket driver supports interactive transactions for timers and ordering. */
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function getDb() {
  if (database) return database;
  const pool = new Pool({ connectionString: getEnv().DATABASE_URL, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
  // The driver discards disconnected idle clients. Handle its error event so a
  // dropped connection cannot become an uncaught process error between saves.
  // Only "error" preserves Neon's HTTP fast path for non-transactional reads.
  pool.on("error", () => { console.warn(JSON.stringify({ event: "database_pool_connection_failed" })); });
  return database = drizzle(pool, { schema, logger: { logQuery: recordQuery } });
}
