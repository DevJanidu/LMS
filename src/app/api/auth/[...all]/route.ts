import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { allowRequest } from "@/lib/rate-limit";

export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(getEnv().APP_URL).origin) return new Response(null, { status: 403 });
  if (!(await allowRequest(`auth-route:${request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local"}`, 10))) return new Response(null, { status: 429 });
  return toNextJsHandler(getAuth()).POST(request);
}
