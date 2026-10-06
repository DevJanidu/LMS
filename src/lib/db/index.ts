import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";
neonConfig.poolQueryViaFetch = true;

/** WebSocket driver supports interactive transactions for timers and ordering. */
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function getDb() {
  return database ??= drizzle(new Pool({ connectionString: getEnv().DATABASE_URL }), { schema });
}
