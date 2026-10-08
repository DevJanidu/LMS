import { environment as env } from "./env-runtime.mjs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
neonConfig.poolQueryViaFetch = true;
const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
for (const [name, query] of [["pool_fetch", () => pool.query("select 1")], ["drizzle_read", () => drizzle(pool).execute(sql`select 1`)]]) {
  const start = performance.now();
  try { await query(); console.info(JSON.stringify({ check: name, ok: true, ms: Math.round(performance.now()-start) })); }
  catch { console.info(JSON.stringify({ check: name, ok: false, ms: Math.round(performance.now()-start), details: "suppressed" })); }
}
const start = performance.now();
try { const client = await pool.connect(); await client.query("begin"); await client.query("select 1"); await client.query("rollback"); client.release(); console.info(JSON.stringify({ check: "transaction_transport", ok: true, ms: Math.round(performance.now()-start) })); }
catch { console.info(JSON.stringify({ check: "transaction_transport", ok: false, ms: Math.round(performance.now()-start), details: "suppressed" })); }
await pool.end();
