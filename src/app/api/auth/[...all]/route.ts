import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getAccountEnv } from "@/lib/env";
import { requestAuthLimit, reservePasswordReset, releasePasswordReset } from "@/lib/auth/limits";
import { z } from "zod";
import { authenticationFailureKind, authFeedback, verifySession } from "@/lib/auth/errors";
import { trackResetDelivery } from "@/lib/email/reset-delivery";
import { passwordResetLink } from "@/lib/auth/reset-link";
import { validResetToken } from "@/lib/auth/input";

async function get(request: Request) {
  const path = authPath(request);
  // Existing emailed callbacks must work while logged out, including links
  // whose callbackURL was lost by a mail client. Token validity is enforced at reset.
  if (path === "/reset-password" || /^\/reset-password\/[^/]+$/.test(path)) {
    const token = path.slice("/reset-password/".length);
    const destination = validResetToken(token) && path !== "/reset-password"
      ? passwordResetLink(getAccountEnv().APP_URL, token)
      : new URL("/reset-password?error=INVALID_TOKEN", getAccountEnv().APP_URL).href;
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
  if (request.headers.get("origin") !== new URL(getAccountEnv().APP_URL).origin) return privateResponse(new Response(null, { status: 403 }));
  const limit = await requestAuthLimit(`auth-route:${request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local"}`, 10);
  if (limit !== "allowed") return privateResponse(Response.json({ error: limit === "limited" ? "tooManyRequests" : "authenticationUnavailable" }, { status: limit === "limited" ? 429 : 503 }));
  if (!publicEndpoint(authPath(request)) && !(await activeSession(request))) return privateResponse(new Response(null, { status: 401 }));
  if (["/request-password-reset", "/forget-password"].includes(authPath(request))) {
    const input = await request.clone().json().catch(() => null) as { email?: unknown } | null;
    const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(input?.email);
    if (!email.success) return privateResponse(Response.json({ error: "invalidEmail" }, { status: 400 }));
    const env = getAccountEnv();
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return privateResponse(Response.json({ error: "emailUnavailable" }, { status: 503 }));
    const quota = await reservePasswordReset(email.data);
    if (quota.decision !== "allowed") return privateResponse(Response.json({ error: quota.decision === "limited" ? "passwordResetWeeklyLimit" : "authenticationUnavailable", retryAt: quota.retryAt }, { status: quota.decision === "limited" ? 429 : 503 }));
    try {
      const response = await trackResetDelivery(() => toNextJsHandler(getAuth()).POST(request));
      if (!response.ok && quota.reservation) await releasePasswordReset(quota.reservation);
      return privateResponse(response);
    } catch (error) { if (quota.reservation) await releasePasswordReset(quota.reservation); throw error; }
  }
  return privateResponse(await toNextJsHandler(getAuth()).POST(request));
}
async function guarded(request: Request, handler: (request: Request) => Promise<Response>) {
  try { return await handler(request); }
  catch (error) {
    console.warn(JSON.stringify({ event: "authentication_unavailable", category: authenticationFailureKind(error) }));
    const path = authPath(request);
    if (request.method === "GET" && (path === "/reset-password" || /^\/reset-password\/[^/]+$/.test(path))) {
      // A browser opening an emailed link should see our recovery UI even
      // when APP_URL or another required setting cannot currently be validated.
      return privateResponse(new Response(null, { status: 303, headers: {
        Location: "/reset-password?error=AUTHENTICATION_UNAVAILABLE",
        "Referrer-Policy": "no-referrer",
      } }));
    }
    return privateResponse(Response.json({ error: authFeedback(error).error }, { status: 503 }));
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
