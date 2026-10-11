import { timingSafeEqual } from "node:crypto";
import { runAvenScheduler } from "@/lib/aven/scheduler";
export const runtime = "nodejs",
  maxDuration = 30;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return Response.json(
      { ok: false, error: "schedulerNotConfigured" },
      { status: 503 },
    );
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return new Response(null, { status: 401 });
  try {
    const result = await runAvenScheduler();
    return Response.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.warn(JSON.stringify({ event: "aven_scheduler_failed" }));
    return Response.json({ ok: false }, { status: 503 });
  }
}
