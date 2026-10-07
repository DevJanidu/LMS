import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { NextRequest, NextResponse } from "next/server";

const localize = createMiddleware(routing);
export default function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/^\/(en|ar|es|de)(?=\/|$)/, "");
  const protectedRoute = /^\/(dashboard|subjects|study|calendar|analytics|resources|settings|admin|onboarding)(\/|$)/.test(path);
  const cookie = request.cookies.get("better-auth.session_token") ?? request.cookies.get("__Secure-better-auth.session_token");
  if (protectedRoute && !cookie) {
    const destination = new URL("/login", request.url);
    destination.searchParams.set("returnTo", path + request.nextUrl.search);
    const response = NextResponse.redirect(destination);
    const locale = request.nextUrl.pathname.match(/^\/(en|ar|es|de)(?=\/|$)/)?.[1];
    if (locale) response.cookies.set("NEXT_LOCALE", locale, { sameSite: "lax", path: "/" });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const response = localize(request);
  if (protectedRoute) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next|_vercel|.*\\..*).*)"],
};
