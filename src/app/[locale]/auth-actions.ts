"use server";
import { headers } from "next/headers";
import { getAuth, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAccountEnv } from "@/lib/env";
import { requestAuthLimit, reservePasswordReset, releasePasswordReset } from "@/lib/auth/limits";
import { getSettings } from "@/lib/services/workspace";
import { ageInYears } from "@/lib/validation/age";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { loginDestination } from "@/lib/auth/destination";
import { authenticationFailureKind, authFeedback } from "@/lib/auth/errors";
import { parseAuthInput, type AuthResult } from "@/lib/auth/input";
import { trackResetDelivery } from "@/lib/email/reset-delivery";

export async function authenticate(input: unknown): Promise<AuthResult> {
  const parsed = parseAuthInput(input);
  if (!parsed.success) return parsed.result;
  const v = parsed.data;
  let destination: string;
  let resetReservation: string | undefined;
  try {
    const auth = getAuth();
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    const limits = await Promise.all([requestAuthLimit(`auth:${v.mode}:${ip}`, 10), ...(v.mode === "forgot-password" ? [] : [requestAuthLimit(`account:${v.mode}:${v.email?.toLowerCase() ?? ip}`, 5)])]);
    if (limits.includes("unavailable")) return { ok: false as const, error: "authenticationUnavailable" };
    if (limits.includes("limited")) return { ok: false as const, error: "tooManyRequests" };
    if (v.mode === "register") {
      if (!v.email || !v.password || !v.name || !v.acceptedTerms) return { ok: false as const, error: "invalidInput" };
      if (v.dateOfBirth && v.dateOfBirth > new Date().toISOString().slice(0, 10)) return { ok: false as const, error: "invalidInput" };
      const minimumAge = (await getSettings()).minimumAge ?? 0;
      if (minimumAge > 0 && (!v.dateOfBirth || ageInYears(v.dateOfBirth) < minimumAge)) return { ok: false as const, error: "agePolicy" };
      const body = { email: v.email.toLowerCase(), password: v.password, name: v.name, acceptedTerms: true, dateOfBirth: v.dateOfBirth };
      await auth.api.signUpEmail({ headers: requestHeaders, body });
      destination = "/onboarding";
    }
    else if (v.mode === "login") {
      if (!v.email || !v.password) return { ok: false as const, error: "invalidInput" };
      const result = await auth.api.signInEmail({ headers: requestHeaders, body: { email: v.email.toLowerCase(), password: v.password } });
      const [user] = await getDb().select({ role: users.role, status: users.status, onboardingCompletedAt: users.onboardingCompletedAt }).from(users).where(eq(users.id, result.user.id));
      if (!user || user.status !== "active") return { ok: false as const, error: "accountInactive" };
      destination = loginDestination(user.role, Boolean(user.onboardingCompletedAt), v.returnTo);
    }
    else if (v.mode === "forgot-password") {
      if (!v.email) return { ok: false as const, error: "invalidInput" };
      const env = getAccountEnv();
      if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { ok: false as const, error: "emailUnavailable" };
      const quota = await reservePasswordReset(v.email);
      if (quota.decision === "unavailable") return { ok: false, error: "authenticationUnavailable" };
      if (quota.decision === "limited") return { ok: false, error: "passwordResetWeeklyLimit", retryAt: quota.retryAt };
      resetReservation = quota.reservation;
      await trackResetDelivery(() => auth.api.requestPasswordReset({ headers: requestHeaders, body: { email: v.email!.toLowerCase(), redirectTo: `${env.APP_URL}/reset-password` } }));
      return { ok: true as const, href: "", email: v.email };
    }
    else {
      if (!v.password || !v.token) return { ok: false as const, error: "invalidInput" };
      await auth.api.resetPassword({ headers: requestHeaders, body: { newPassword: v.password, token: v.token } });
      destination = "/login?reset=success";
    }
  } catch (error) {
    if (v.mode === "forgot-password") {
      if (resetReservation) await releasePasswordReset(resetReservation);
      console.warn(JSON.stringify({ event: "password_reset_unavailable", category: authenticationFailureKind(error) }));
      return { ok: false, ...authFeedback(error) };
    }
    const category = authenticationFailureKind(error);
    if (category !== "session_provider") console.warn(JSON.stringify({ event: "authentication_unavailable", category }));
    return { ok: false, ...authFeedback(error) };
  }
  redirect({ href: destination, locale: await getLocale() });
  return { ok: true, href: destination };
}
export async function signOut() {
  await requireUser();
  await getAuth().api.signOut({ headers: await headers() });
}
