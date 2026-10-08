import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { allowRequest } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const path = authPath(request);
  if (path !== "/get-session" && !publicEndpoint(path) && !(await activeSession(request))) return privateResponse(new Response(null, { status: 401 }));
  const response = await toNextJsHandler(getAuth()).GET(request);
  if (path === "/get-session" && response.ok) {
    const body = await response.clone().json() as { user?: { status?: string } } | null;
    if (body?.user && body.user.status !== "active") return privateResponse(Response.json(null));
  }
  return privateResponse(response);
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(getEnv().APP_URL).origin) return privateResponse(new Response(null, { status: 403 }));
  if (!(await allowRequest(`auth-route:${request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local"}`, 10))) return privateResponse(new Response(null, { status: 429 }));
  if (!publicEndpoint(authPath(request)) && !(await activeSession(request))) return privateResponse(new Response(null, { status: 401 }));
  return privateResponse(await toNextJsHandler(getAuth()).POST(request));
}
const authPath = (request: Request) => new URL(request.url).pathname.replace(/^\/api\/auth/, "");
const publicEndpoint = (path: string) => /^\/(?:sign-in\/|sign-up\/|callback\/|request-password-reset$|forget-password$|reset-password$|verify-email$|sign-out$)/.test(path);
async function activeSession(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.status === "active";
}
function privateResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
