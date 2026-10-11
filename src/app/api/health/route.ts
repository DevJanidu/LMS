import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getAccountEnv, InvalidServerConfiguration } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET() {
  try { getAccountEnv(); await getDb().execute(sql`select 1`); return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    // Readiness includes authentication. Setting names are public documentation;
    // secret values, provider messages and connection URLs are never returned.
    const invalidFields = error instanceof InvalidServerConfiguration
      ? error.fields.filter(field => ["DATABASE_URL", "AUTH_SECRET", "APP_URL"].includes(field)) : undefined;
    return Response.json({ ok: false, ...(invalidFields ? { invalidFields } : {}) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
