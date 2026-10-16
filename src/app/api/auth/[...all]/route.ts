import { toNextJsHandler } from "better-auth/next-js";
import { getAuth, readActiveSession } from "@/lib/auth";
import { getAccountEnv } from "@/lib/env";
import { requestAuthLimit } from "@/lib/auth/limits";
import { clientAddress } from "@/lib/auth/client-address";
import { authEvent } from "@/lib/auth/events";
import { sessionPastAbsoluteLifetime } from "@/lib/auth/policy";
import { authenticationFailureKind, authFeedback } from "@/lib/auth/errors";

/** Shared networks (schools, campuses) sign in together, so the per-address budget is generous. */
const AUTH_REQUESTS_PER_MINUTE = 30;

async function get(request: Request) {
  const path = authPath(request);
  if (callbackPath(path)) {
    const denied = await admission(request, "auth-callback");
    if (denied) return denied;
    const response = await toNextJsHandler(getAuth()).GET(request);
    logCallback(response);
    return privateResponse(response);
  }
  if (path === "/get-session") {
    // Same checks as server code: inactive users and sessions past their
    // absolute lifetime read as signed out (server reads also revoke them).
    const response = await toNextJsHandler(getAuth()).GET(request);
    if (!response.ok) return privateResponse(response);
    const body = await response.clone().json() as { user?: { status?: string; role?: string }; session?: { createdAt?: string } } | null;
    if (body?.user && (body.user.status !== "active" || sessionPastAbsoluteLifetime(body.session?.createdAt ?? "", body.user.role ?? ""))) return privateResponse(Response.json(null));
    return privateResponse(response);
  }
  if (!signedInEndpoint("GET", path) || !(await readActiveSession(request.headers))) return privateResponse(new Response(null, { status: signedInEndpoint("GET", path) ? 401 : 404 }));
  return privateResponse(await toNextJsHandler(getAuth()).GET(request));
}
async function post(request: Request) {
  if (request.headers.get("origin") !== new URL(getAccountEnv().APP_URL).origin) return privateResponse(new Response(null, { status: 403 }));
  const denied = await admission(request, "auth-route");
  if (denied) return denied;
  const path = authPath(request);
  if (!publicEndpoint(path)) {
    if (!signedInEndpoint("POST", path)) return privateResponse(new Response(null, { status: 404 }));
    if (!(await readActiveSession(request.headers))) return privateResponse(new Response(null, { status: 401 }));
  }
  const response = await toNextJsHandler(getAuth()).POST(request);
  if (path === "/sign-out" && response.ok) authEvent("auth.sign_out", { scope: "current" });
  return privateResponse(response);
}
async function guarded(request: Request, handler: (request: Request) => Promise<Response>) {
  try { return await handler(request); }
  catch (error) {
    console.warn(JSON.stringify({ event: "authentication_unavailable", category: authenticationFailureKind(error) }));
    return privateResponse(Response.json({ error: authFeedback(error).error }, { status: 503 }));
  }
}
export async function GET(request: Request) { return guarded(request, get); }
export async function POST(request: Request) { return guarded(request, post); }

async function admission(request: Request, bucket: string) {
  const limit = await requestAuthLimit(`${bucket}:${clientAddress(request)}`, AUTH_REQUESTS_PER_MINUTE);
  if (limit === "allowed") return undefined;
  return privateResponse(Response.json({ error: limit === "limited" ? "tooManyRequests" : "authenticationUnavailable" }, { status: limit === "limited" ? 429 : 503 }));
}
/** OAuth failures redirect to `/login?error=<code>`; successes are logged by the session hook. */
function logCallback(response: Response) {
  const location = response.headers.get("location");
  if (!location) return;
  try {
    const error = new URL(location, "http://internal.invalid").searchParams.get("error");
    if (error) authEvent("auth.sign_in_failed", { reason: error });
  } catch { authEvent("auth.sign_in_failed", { reason: "other" }); }
}
const authPath = (request: Request) => new URL(request.url).pathname.replace(/^\/api\/auth/, "");
const callbackPath = (path: string) => /^\/callback\/[^/]+$/.test(path);
// Signed-out visitors may only start Google sign-in, finish it, or sign out.
const publicEndpoint = (path: string) => /^\/(?:sign-in\/social$|callback\/[^/]+$|sign-out$)/.test(path);
// Signed-in users may manage their own sessions. Profile, email, account-linking,
// token and deletion endpoints stay closed: Acadence performs those itself.
const signedInEndpoint = (method: "GET" | "POST", path: string) => method === "GET"
  ? path === "/list-sessions"
  : /^\/(?:revoke-session|revoke-sessions|revoke-other-sessions)$/.test(path);
function privateResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
