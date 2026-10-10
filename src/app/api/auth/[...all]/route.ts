import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { requestLimit } from "@/lib/rate-limit";
import { authenticationFailureKind, verifySession } from "@/lib/auth/errors";

async function get(request: Request) {
  const path = authPath(request);
  if (path !== "/get-session" && !publicEndpoint(path) && !(await activeSession(request))) return privateResponse(new Response(null, { status: 401 }));
  const response = await toNextJsHandler(getAuth()).GET(request);
  if (path === "/get-session" && response.ok) {
    const body = await response.clone().json() as { user?: { status?: string } } | null;
    if (body?.user && body.user.status !== "active") return privateResponse(Response.json(null));
  }
  return privateResponse(response);
}
async function post(request: Request) {
  if (request.headers.get("origin") !== new URL(getEnv().APP_URL).origin) return privateResponse(new Response(null, { status: 403 }));
  const limit = await requestLimit(`auth-route:${request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local"}`, 10);
  if (limit !== "allowed") return privateResponse(Response.json({ error: limit === "limited" ? "tooManyRequests" : "authenticationUnavailable" }, { status: limit === "limited" ? 429 : 503 }));
  if (!publicEndpoint(authPath(request)) && !(await activeSession(request))) return privateResponse(new Response(null, { status: 401 }));
  return privateResponse(await toNextJsHandler(getAuth()).POST(request));
}
async function guarded(request: Request, handler: (request: Request) => Promise<Response>) {
  try { return await handler(request); }
  catch (error) {
    console.warn(JSON.stringify({ event: "authentication_unavailable", category: authenticationFailureKind(error) }));
    return privateResponse(Response.json({ error: "authenticationUnavailable" }, { status: 503 }));
  }
}
export async function GET(request: Request) { return guarded(request, get); }
export async function POST(request: Request) { return guarded(request, post); }
const authPath = (request: Request) => new URL(request.url).pathname.replace(/^\/api\/auth/, "");
const publicEndpoint = (path: string) => /^\/(?:sign-in\/|sign-up\/|callback\/|request-password-reset$|forget-password$|reset-password$|verify-email$|sign-out$)/.test(path);
async function activeSession(request: Request) {
  const session = await verifySession(() => getAuth().api.getSession({ headers: request.headers }));
  return session?.user.status === "active";
}
function privateResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
