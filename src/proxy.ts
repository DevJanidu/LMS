import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";
import { NextRequest, NextResponse } from "next/server";
import { safeReturnPath } from "@/lib/auth/return-path";
import { paidPlan, SELECTED_PLAN_COOKIE, SELECTED_PLAN_MAX_AGE } from "@/lib/billing/selection";

const localize = createMiddleware(routing);
export default function proxy(request: NextRequest) {
  if (/^\/(ar|es|de)(?=\/|$)/.test(request.nextUrl.pathname)) {
    const destination = request.nextUrl.clone();
    destination.pathname = destination.pathname.replace(/^\/(ar|es|de)(?=\/|$)/, "") || "/";
    const response = NextResponse.redirect(destination);
    response.cookies.delete("NEXT_LOCALE");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const path = request.nextUrl.pathname.replace(/^\/(en|ar|es|de)(?=\/|$)/, "");
  const protectedRoute = /^\/(dashboard|subjects|study|calendar|analytics|resources|goals|aven|settings|billing|admin|onboarding)(\/|$)/.test(path);
  const cookie = request.cookies.get("better-auth.session_token") ?? request.cookies.get("__Secure-better-auth.session_token");
  if (protectedRoute && !cookie) {
    const destination = new URL("/login", request.url);
    destination.searchParams.set("returnTo", safeReturnPath(path + request.nextUrl.search) ?? "/dashboard");
    const response = NextResponse.redirect(destination);
    response.headers.set("Cache-Control", "private, no-store");
    // Keep a plan chosen on the pricing page through signup and onboarding.
    const plan = /^\/billing(\/|$)/.test(path) ? paidPlan(request.nextUrl.searchParams.get("plan")) : undefined;
    if (plan) response.cookies.set(SELECTED_PLAN_COOKIE, plan, { maxAge: SELECTED_PLAN_MAX_AGE, path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
    return response;
  }
  // next-intl forwards request headers with its locale rewrite. Overwrite the
  // hint here so an expired cookie preserves the same safe return path too.
  request.headers.set("x-lms-return-to", safeReturnPath(path + request.nextUrl.search) ?? "/dashboard");
  const response = localize(request);
  if (protectedRoute) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next|_vercel|.*\\..*).*)"],
};
