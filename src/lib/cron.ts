import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
export async function runCron(request: Request, job: () => Promise<unknown>) {
  const expected = Buffer.from(`Bearer ${getEnv().CRON_SECRET}`), actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response(null, { status: 401 });
  try { return Response.json(await job(), { headers: { "Cache-Control": "no-store" } }); }
  catch { console.error(JSON.stringify({ event: "cron_failed", job: job.name })); return Response.json({ ok: false }, { status: 500 }); }
}
