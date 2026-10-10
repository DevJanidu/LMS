import { querySessions, queryResources, queryAdminUsers, queryBlocks, resourceDetail, searchWorkspace } from "@/lib/services/workspace-reads";
import { getCurrentUser } from "@/lib/auth";
import { AuthenticationUnavailable } from "@/lib/auth/errors";

/** Reads have their own HTTP lifecycle and never wait behind a mutation action. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const started = performance.now();
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ ok: false, error: "authenticationFailed" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    const raw = params.get("input") ?? "null";
    if (raw.length > 10000) return Response.json({ ok: false, error: "invalidInput" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    const input = JSON.parse(raw);
    const kind = params.get("kind");
    const authenticated = performance.now();
    if (user.role !== (kind === "users" ? "super_admin" : "learner")) return Response.json({ ok: false, error: "recordUnavailable" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    const result = kind === "sessions" ? await querySessions(user, input)
      : kind === "resources" ? await queryResources(user, input)
      : kind === "users" ? await queryAdminUsers(user, input)
      : kind === "blocks" ? await queryBlocks(user, input)
      : kind === "resource" ? await resourceDetail(user, input)
      : kind === "search" ? await searchWorkspace(user, input) : undefined;
    const failure = result && "ok" in result && !result.ok ? result.error : undefined;
    const status = !result || failure === "invalidInput" ? 400 : failure === "recordUnavailable" ? 404 : failure ? 503 : 200;
    return Response.json(result ?? { ok: false, error: "invalidInput" }, { status, headers: { "Cache-Control": "private, no-store", "Server-Timing": `auth;dur=${(authenticated - started).toFixed(1)}, read;dur=${(performance.now() - authenticated).toFixed(1)}` } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof SyntaxError ? "invalidInput" : error instanceof AuthenticationUnavailable ? "authenticationUnavailable" : "databaseUnavailable" }, { status: error instanceof SyntaxError ? 400 : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
