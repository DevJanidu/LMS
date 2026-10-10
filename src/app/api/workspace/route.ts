import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { operationsSchema } from "@/lib/validation/operations";
import { DomainError, mutate } from "@/lib/services/mutations";
import { getShellWorkspace } from "@/lib/services/workspace";
import { subjectPageWorkspace, analyticsPageWorkspace, resourcePageWorkspace } from "@/lib/services/focused-workspace";
import { listSessions, sessionFilterSchema } from "@/lib/services/lists";
import { listResources, resourceFilterSchema } from "@/lib/services/resources";
import type { Workspace } from "@/types";
import { requestLimit } from "@/lib/rate-limit";
import { AuthenticationUnavailable } from "@/lib/auth/errors";
import { preconditionsSchema } from "@/lib/workspace/preconditions";
import { platformAnalytics } from "@/lib/analytics/platform";
import { getScheduleBlocksInRange } from "@/lib/services/lists";
import { localDay, shiftDay } from "@/lib/analytics";

const respond = (value: unknown, status = 200, timing?: string) => Response.json(value, { status,
  headers: { "Cache-Control": "private, no-store", ...(timing ? { "Server-Timing": timing } : {}) } });
const inputSchema = z.object({ operations: operationsSchema, preconditions: preconditionsSchema.optional() });
const groupsSchema = z.array(z.enum(["shell", "subjects", "analytics", "resources", "sessions", "blocks", "platform"])).max(7);

/** Independent fetch requests avoid Next's globally sequential action dispatcher. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(getEnv().APP_URL).origin) return respond({ ok: false, error: "invalidInput" }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 1048576) return respond({ ok: false, error: "invalidInput" }, 413);
  const started = performance.now();
  let writing = false;
  try {
    const user = await getCurrentUser();
    if (!user) return respond({ ok: false, error: "authenticationFailed" }, 401);
    const text = await request.text();
    if (text.length > 1048576) return respond({ ok: false, error: "invalidInput" }, 413);
    const parsed = inputSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return respond({ ok: false, error: "invalidInput" }, 400);
    const limit = await requestLimit(`workspace-write:${user.id}`, 120);
    if (limit !== "allowed") return respond({ ok: false, error: limit === "limited" ? "tooManyRequests" : "authenticationUnavailable", uncertain: false, failureStage: "security" }, limit === "limited" ? 429 : 503);
    const authenticated = performance.now();
    writing = true;
    const result = await mutate(user.id, parsed.data.operations, parsed.data.preconditions);
    // RETURNING records are collected inside the transaction and sent only after commit.
    return respond({ ok: true, ...result }, 200, `auth;dur=${(authenticated - started).toFixed(1)}, mutation;dur=${(performance.now() - authenticated).toFixed(1)}`);
  } catch (error) {
    return respond({ ok: false, error: error instanceof DomainError ? error.message : error instanceof SyntaxError ? "invalidInput" : error instanceof AuthenticationUnavailable ? "authenticationUnavailable" : "databaseUnavailable", uncertain: writing && !(error instanceof DomainError), failureStage: writing ? "transaction" : error instanceof SyntaxError ? "validation" : "session" }, error instanceof SyntaxError ? 400 : error instanceof DomainError ? 409 : 503);
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return respond({ ok: false, error: "authenticationFailed" }, 401);
    const parsed = groupsSchema.safeParse(new URL(request.url).searchParams.get("groups")?.split(",") ?? ["shell"]);
    if (!parsed.success) return respond({ ok: false, error: "invalidInput" }, 400);
    const groups = [...new Set(parsed.data)];
    if ((user.role !== "learner" && groups.some(group => !["shell", "platform"].includes(group))) || (user.role === "learner" && groups.includes("platform"))) return respond({ ok: false, error: "recordUnavailable" }, 403);
    const patches = await Promise.all(groups.map(async (group): Promise<Partial<Workspace>> => {
      if (group === "shell") {
        const shell = await getShellWorkspace(user);
        return { user: shell.user, settings: shell.settings, timer: shell.timer, notifications: shell.notifications };
      }
      if (group === "subjects") {
        const page = await subjectPageWorkspace(user);
        return { subjects: page.subjects, topics: page.topics, subjectStatistics: page.subjectStatistics };
      }
      if (group === "analytics") {
        const page = await analyticsPageWorkspace(user);
        return { analytics: page.analytics };
      }
      if (group === "blocks") {
        const today = localDay(Date.now(), user.timezone);
        return { blocks: await getScheduleBlocksInRange(user.id, { from: shiftDay(today, -1), to: shiftDay(today, 7) }, user.timezone) };
      }
      if (group === "platform") {
        const shell = await getShellWorkspace(user);
        return { platform: await platformAnalytics(user.timezone, shell.user.weekStartDay) };
      }
      if (group === "sessions") return { sessions: (await listSessions(user.id, user.timezone, sessionFilterSchema.parse({}))).rows };
      const [page, list] = await Promise.all([resourcePageWorkspace(user), listResources(user.id, resourceFilterSchema.parse({}))]);
      return { resources: list.rows, storageBytes: page.storageBytes, resourceCounts: page.resourceCounts, settings: page.settings };
    }));
    return respond({ ok: true, fields: Object.assign({}, ...patches) });
  } catch (error) { return respond({ ok: false, error: error instanceof AuthenticationUnavailable ? "authenticationUnavailable" : "databaseUnavailable" }, 503); }
}
