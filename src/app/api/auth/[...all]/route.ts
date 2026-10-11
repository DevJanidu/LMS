import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { requestLimit } from "@/lib/rate-limit";
import { authenticationFailureKind, verifySession } from "@/lib/auth/errors";
import { passwordResetLink } from "@/lib/auth/reset-link";
import { validResetToken } from "@/lib/auth/input";

async function get(request: Request) {
  const path = authPath(request);
  // Existing emailed callbacks must work while logged out, including links
  // whose callbackURL was lost by a mail client. Token validity is enforced at reset.
  if (path === "/reset-password" || /^\/reset-password\/[^/]+$/.test(path)) {
    const token = path.slice("/reset-password/".length);
    const destination = validResetToken(token) && path !== "/reset-password"
      ? passwordResetLink(getEnv().APP_URL, token)
      : new URL("/reset-password?error=INVALID_TOKEN", getEnv().APP_URL).href;
    const response = privateResponse(Response.redirect(destination, 303));
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
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
