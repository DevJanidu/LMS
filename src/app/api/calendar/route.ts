import { getCurrentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { calendarMutationSchema } from "@/lib/validation/calendar";
import { getScheduleBlocksInRange, rangeSchema } from "@/lib/services/lists";
import { CalendarError, mutateCalendar, getCalendarBlock } from "@/lib/services/calendar";
import { uuidSchema } from "@/lib/validation";
import { timed } from "@/lib/perf";

export const runtime = "nodejs";
const response = (value: unknown, status = 200, timing?: string) => Response.json(value, { status,
  headers: { "Cache-Control": "private, no-store", ...(timing ? { "Server-Timing": timing } : {}) } });
async function account() {
  const user = await getCurrentUser();
  if (!user) throw new CalendarError("authenticationFailed", 401);
  if (user.role !== "learner") throw new CalendarError("recordUnavailable", 403);
  return user;
}
function failure(error: unknown) {
  return response({ ok: false, error: error instanceof CalendarError ? error.message : "saveFailed" }, error instanceof CalendarError ? error.status : 503);
}
export async function GET(request: Request) {
  const started = performance.now();
  try {
    const user = await account(), authenticated = performance.now();
    const params = new URL(request.url).searchParams;
    if (params.has("id")) {
      const id = uuidSchema.safeParse(params.get("id"));
      if (!id.success) return response({ ok: false, error: "invalidInput" }, 400);
      return response({ ok: true, block: await getCalendarBlock(user.id, id.data) });
    }
    const range = rangeSchema.safeParse({ from: params.get("from"), to: params.get("to") });
    if (!range.success) return response({ ok: false, error: "invalidInput" }, 400);
    const blocks = await timed("calendar.range", () => getScheduleBlocksInRange(user.id, range.data, user.timezone));
    return response({ ok: true, blocks }, 200, `auth;dur=${(authenticated - started).toFixed(1)}, db;dur=${(performance.now() - authenticated).toFixed(1)}`);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(getEnv().APP_URL).origin) return response({ ok: false, error: "invalidInput" }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 262144) return response({ ok: false, error: "invalidInput" }, 413);
  const started = performance.now();
  try {
    const user = await account(), authenticated = performance.now();
    const text = await request.text();
    if (text.length > 262144) return response({ ok: false, error: "invalidInput" }, 413);
    let json: unknown;
    try { json = JSON.parse(text); } catch { return response({ ok: false, error: "invalidInput" }, 400); }
    const parsed = calendarMutationSchema.safeParse(json);
    if (!parsed.success) return response({ ok: false, error: "invalidInput" }, 400);
    const change = await timed("calendar.mutation", () => mutateCalendar(user.id, parsed.data));
    return response({ ok: true, ...change }, 200, `auth;dur=${(authenticated - started).toFixed(1)}, mutation;dur=${(performance.now() - authenticated).toFixed(1)}`);
  } catch (error) { return failure(error); }
}
