import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { NextRequest, NextResponse } from "next/server";

const localize = createMiddleware(routing);
export default function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/(en|ar|es|de)(?=\/|$)/, "");
  const protectedRoute = /^\/(dashboard|subjects|study|calendar|analytics|resources|settings|admin|onboarding)(\/|$)/.test(path);
  const cookie = request.cookies.get("better-auth.session_token") ?? request.cookies.get("__Secure-better-auth.session_token");
  if (protectedRoute && !cookie) return NextResponse.redirect(new URL("/login", request.url));
  return localize(request);
}

export const config = {
  matcher: ["/((?!api/|_next|_vercel|.*\\..*).*)"],
};
