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
  return database ??= drizzle(new Pool({ connectionString: getEnv().DATABASE_URL, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 }), { schema, logger: { logQuery: recordQuery } });
}
