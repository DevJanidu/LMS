import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { hash, verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import * as schema from "@/lib/db/schema";
import { sendAccountEmail } from "@/lib/email";
import { z } from "zod";
import { cache } from "react";
import { ageInYears } from "@/lib/validation/age";
import { safeReturnPath } from "./return-path";
import { timed } from "@/lib/perf";

const registrationSchema = z.object({ acceptedTerms: z.literal(true), name: z.string().trim().min(1).max(150), email: z.email(), dateOfBirth: z.iso.date().refine(value => value <= new Date().toISOString().slice(0, 10)).optional() });

function createAuth() {
  const env = getEnv();
  return betterAuth({
    appName: "StudyFlow", baseURL: env.APP_URL, secret: env.AUTH_SECRET,
    logger: { disabled: true },
    database: drizzleAdapter(getDb(), { provider: "pg", schema: { user: schema.users, session: schema.authSessions, account: schema.accounts, verification: schema.verifications, rateLimit: schema.rateLimits,
      usersRelations: schema.usersRelations, authSessionsRelations: schema.authSessionsRelations, accountsRelations: schema.accountsRelations } }),
    emailAndPassword: {
      enabled: true, minPasswordLength: 8, maxPasswordLength: 128,
      password: { hash: password => hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }), verify: ({ hash: digest, password }) => verify(digest, password) },
      sendResetPassword: async ({ user, url }) => { await sendAccountEmail(user.email, "reset", url); },
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: { sendVerificationEmail: async ({ user, url }) => { await sendAccountEmail(user.email, "verify", url); } },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {},
    user: { additionalFields: {
      role: { type: "string", defaultValue: "learner", input: false },
      status: { type: "string", defaultValue: "active", input: false },
      acceptedTermsAt: { type: "date", input: false }, dateOfBirth: { type: "string", required: false },
      timezone: { type: "string", input: false },
      learningContext: { type: "string", required: false, input: false },
      onboardingCompletedAt: { type: "date", required: false, input: false },
      lastActiveAt: { type: "date", input: false },
    } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: { database: { generateId: () => crypto.randomUUID(), joins: true }, useSecureCookies: process.env.NODE_ENV === "production", defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } },
    // Both public entry points (auth route POST and authenticate Server Action)
    // enforce fail-closed Upstash sliding windows before invoking Better Auth.
    // A second database counter would add round trips to every credential request.
    rateLimit: { enabled: false },
    databaseHooks: {
      user: { create: { before: async (user, context) => {
        const registration = registrationSchema.safeParse(context?.body);
        if (!registration.success) throw new APIError("BAD_REQUEST", { message: "Enter valid details and accept Terms and Privacy before registering." });
        const { getSettings } = await import("@/lib/services/workspace");
        const minimumAge = (await getSettings()).minimumAge ?? 0;
        if (minimumAge > 0 && (!registration.data.dateOfBirth || ageInYears(registration.data.dateOfBirth) < minimumAge)) throw new APIError("BAD_REQUEST", { message: "Registration does not meet the configured age policy." });
        return { data: { ...user, name: registration.data.name, email: registration.data.email.toLowerCase(), dateOfBirth: registration.data.dateOfBirth, role: "learner", status: "active", acceptedTermsAt: new Date() } };
      } } },
      session: { create: { before: async (session) => {
        const [user] = await getDb().select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, session.userId));
        if (!user || user.status !== "active") throw new APIError("FORBIDDEN", { message: "Account unavailable." });
        after(async () => {
          try { await getDb().update(schema.users).set({ lastActiveAt: new Date() }).where(eq(schema.users.id, session.userId)); }
          catch { console.warn(JSON.stringify({ event: "last_active_update_failed" })); }
        });
        return { data: session };
      } } },
    },
    plugins: [nextCookies()],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }

export const getCurrentUser = cache(async () => {
  const requestHeaders = await headers();
  const session = await timed("auth.session", () => getAuth().api.getSession({ headers: requestHeaders })).catch(() => { throw new Error("Authentication service unavailable."); });
  if (!session) return null;
  const user = session.user;
  if (user.status !== "active") return null;
  // Cookie caching remains disabled, so Better Auth retrieves live session and
  // account state on each request. Its user row already contains these fields.
  return {
    id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified,
    image: user.image ?? null, role: user.role as "learner" | "super_admin",
    status: user.status as "active", timezone: user.timezone,
    learningContext: user.learningContext ?? null,
    acceptedTermsAt: user.acceptedTermsAt ? new Date(user.acceptedTermsAt) : null,
    dateOfBirth: user.dateOfBirth ?? null,
    onboardingCompletedAt: user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt) : null,
    lastActiveAt: new Date(user.lastActiveAt), createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  } satisfies typeof schema.users.$inferSelect;
});
export const requireUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) {
    const requestHeaders = await headers();
    const destination = safeReturnPath(requestHeaders.get("x-lms-return-to")) ?? "/dashboard";
    redirect({ href: `/login?returnTo=${encodeURIComponent(destination)}`, locale: await getLocale() });
  }
  return user!;
});
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect({ href: "/dashboard", locale: await getLocale() });
  return user;
}
export async function requireLearner() {
  const user = await requireUser();
  if (user.role !== "learner") redirect({ href: "/admin", locale: await getLocale() });
  return user;
}
