"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuth, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { allowRequest } from "@/lib/rate-limit";
import { getSettings } from "@/lib/services/workspace";
import { ageInYears } from "@/lib/validation/age";

const inputSchema = z.object({ mode: z.enum(["login", "register", "forgot-password", "reset-password"]), email: z.email().optional(), name: z.string().trim().min(1).max(150).optional(), password: z.string().min(8).max(128).optional(), acceptedTerms: z.boolean().optional(), dateOfBirth: z.iso.date().optional(), token: z.string().max(500).optional() });
export async function authenticate(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  const v = parsed.data;
  try {
    const auth = getAuth();
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    if (!(await allowRequest(`auth:${v.mode}:${ip}`, 10)) || !(await allowRequest(`account:${v.mode}:${v.email?.toLowerCase() ?? ip}`, 5))) return { ok: false as const, error: "tooManyRequests" };
    if (v.mode === "register") {
      if (!v.email || !v.password || !v.name || !v.acceptedTerms) return { ok: false as const, error: "invalidInput" };
      if (v.dateOfBirth && v.dateOfBirth > new Date().toISOString().slice(0, 10)) return { ok: false as const, error: "invalidInput" };
      const minimumAge = (await getSettings()).minimumAge ?? 0;
      if (minimumAge > 0 && (!v.dateOfBirth || ageInYears(v.dateOfBirth) < minimumAge)) return { ok: false as const, error: "agePolicy" };
      const body = { email: v.email.toLowerCase(), password: v.password, name: v.name, acceptedTerms: true, dateOfBirth: v.dateOfBirth };
      await auth.api.signUpEmail({ headers: requestHeaders, body });
      return { ok: true as const, href: "/onboarding" };
    }
    if (v.mode === "login") {
      if (!v.email || !v.password) return { ok: false as const, error: "invalidInput" };
      const result = await auth.api.signInEmail({ headers: requestHeaders, body: { email: v.email.toLowerCase(), password: v.password } });
      const [user] = await getDb().select({ role: users.role, onboardingCompletedAt: users.onboardingCompletedAt }).from(users).where(eq(users.id, result.user.id));
      return { ok: true as const, href: user.role === "super_admin" ? "/admin" : user.onboardingCompletedAt ? "/dashboard" : "/onboarding" };
    }
    if (v.mode === "forgot-password") {
      if (!v.email) return { ok: false as const, error: "invalidInput" };
      const env = getEnv();
      if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { ok: false as const, error: "emailUnavailable" };
      await auth.api.requestPasswordReset({ headers: requestHeaders, body: { email: v.email.toLowerCase(), redirectTo: `${getEnv().APP_URL}/reset-password` } });
      return { ok: true as const, href: "" };
    }
    if (!v.password || !v.token) return { ok: false as const, error: "invalidInput" };
    await auth.api.resetPassword({ headers: requestHeaders, body: { newPassword: v.password, token: v.token } });
    return { ok: true as const, href: "/login" };
  } catch {
    if (v.mode === "forgot-password") return { ok: true as const, href: "" };
    return { ok: false as const, error: "authenticationFailed" };
  }
}
export async function signOut() {
  await requireUser();
  await getAuth().api.signOut({ headers: await headers() });
}
