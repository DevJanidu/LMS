import "server-only";
import { verifySession } from "./errors";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { getAccountEnv } from "@/lib/env";
import * as schema from "@/lib/db/schema";
import { scheduleWelcomeEmail } from "@/lib/email/welcome";
import { cache } from "react";
import { safeReturnPath } from "./return-path";
import { timed } from "@/lib/perf";
import { APP_NAME } from "@/lib/constants";
import { accountLinking, beforeAccountCreate, beforeUserCreate, learnerOnboarded, sessionPastAbsoluteLifetime, withoutProviderTokens } from "./policy";
import { authEvent, libraryLog, safeReason } from "./events";

/** Privileged and security-relevant events are kept in `audit_logs` as well as the log stream. */
export function recordAudit(actorUserId: string, action: string, targetId: string, metadata?: Record<string, string | number | boolean>) {
  after(async () => {
    try { await getDb().insert(schema.auditLogs).values({ actorUserId, action, targetType: "user", targetId, metadata }); }
    catch { console.warn(JSON.stringify({ event: "audit_write_failed", action })); }
  });
}

function createAuth() {
  const env = getAccountEnv();
  return betterAuth({
    appName: APP_NAME, baseURL: env.APP_URL, secret: env.AUTH_SECRET,
    // Library warnings are kept, reduced to a level and a short message.
    logger: { level: "warn", log: libraryLog },
    // OAuth failures return to the sign-in card with only an error code.
    onAPIError: { errorURL: `${env.APP_URL}/login` },
    database: drizzleAdapter(getDb(), { provider: "pg", schema: { user: schema.users, session: schema.authSessions, account: schema.accounts, verification: schema.verifications, rateLimit: schema.rateLimits,
      usersRelations: schema.usersRelations, authSessionsRelations: schema.authSessionsRelations, accountsRelations: schema.accountsRelations } }),
    // Google is the only sign-in method. No endpoint accepts a password.
    emailAndPassword: { enabled: false },
    socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } },
    // See `policy.ts`: verified-email linking only, one Google `sub` per user,
    // operator-authorized links for administrators, and no stored provider tokens.
    account: { accountLinking, updateAccountOnSignIn: false },
    user: { additionalFields: {
      role: { type: "string", defaultValue: "learner", input: false },
      status: { type: "string", defaultValue: "active", input: false },
      acceptedTermsAt: { type: "date", required: false, input: false }, dateOfBirth: { type: "string", required: false, input: false },
      timezone: { type: "string", input: false },
      timezoneMode: { type: "string", defaultValue: "device", input: false },
      learningContext: { type: "string", required: false, input: false },
      onboardingCompletedAt: { type: "date", required: false, input: false },
      lastActiveAt: { type: "date", input: false },
    } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: { database: { generateId: () => crypto.randomUUID(), joins: true }, useSecureCookies: process.env.NODE_ENV === "production", defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } },
    // The public auth route enforces a persistent database admission limit.
    // Disable the provider's duplicate counter.
    rateLimit: { enabled: false },
    databaseHooks: {
      // Terms acceptance and the age policy are collected during onboarding.
      user: { create: { before: beforeUserCreate, after: scheduleWelcomeEmail } },
      account: { create: { before: async (account, context) => {
        try {
          const decision = await beforeAccountCreate(account, context);
          if (decision.linkedExisting) authEvent("auth.account_linked", { userId: account.userId, role: decision.privileged ? "super_admin" : "learner" });
          if (decision.privileged) recordAudit(account.userId, "adminGoogleLinked", account.userId, { provider: "google" });
          return { data: withoutProviderTokens(account) };
        } catch (error) {
          authEvent("auth.account_link_rejected", { userId: account.userId, reason: safeReason((error as APIError).body?.code) });
          throw error;
        }
      } } },
      session: { create: {
        before: async (session) => {
          const [user] = await getDb().select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, session.userId));
          if (!user || user.status !== "active") throw new APIError("FORBIDDEN", { code: "ACCOUNT_INACTIVE", message: "Account unavailable." });
          after(async () => {
            try { await getDb().update(schema.users).set({ lastActiveAt: new Date() }).where(eq(schema.users.id, session.userId)); }
            catch { console.warn(JSON.stringify({ event: "last_active_update_failed" })); }
          });
          return { data: session };
        },
        after: async (session) => {
          const [user] = await getDb().select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, session.userId));
          authEvent("auth.sign_in", { userId: session.userId, role: user?.role });
          if (user?.role === "super_admin") recordAudit(session.userId, "adminSignIn", session.userId);
        },
      } },
    },
    plugins: [nextCookies()],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }

/**
 * The only way application code reads a session. Beyond Better Auth's own
 * signature and expiry checks it rejects inactive users and enforces an absolute
 * lifetime that Better Auth's sliding refresh cannot extend.
 */
export async function readActiveSession(requestHeaders: Headers) {
  const session = await verifySession(() => timed("auth.session", () => getAuth().api.getSession({ headers: requestHeaders })));
  if (!session || session.user.status !== "active") return null;
  if (sessionPastAbsoluteLifetime(session.session.createdAt, session.user.role)) {
    try { await getDb().delete(schema.authSessions).where(eq(schema.authSessions.id, session.session.id)); }
    catch { console.warn(JSON.stringify({ event: "session_expiry_revoke_failed" })); }
    authEvent("auth.session_expired", { userId: session.user.id, role: session.user.role, reason: "absolute_lifetime" });
    return null;
  }
  return session;
}

export const getCurrentUser = cache(async () => {
  const session = await readActiveSession(await headers());
  if (!session) return null;
  const user = session.user;
  // Cookie caching remains disabled, so Better Auth retrieves live session and
  // account state on each request. Its user row already contains these fields.
  return {
    id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified,
    image: user.image ?? null, role: user.role as "learner" | "super_admin",
    status: user.status as "active", timezone: user.timezone, timezoneMode: user.timezoneMode,
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
/**
 * A learner who may not have finished onboarding. Use only for the onboarding
 * steps themselves and for leaving the product (account deletion).
 */
export async function requireLearnerAccount() {
  const user = await requireUser();
  if (user.role !== "learner") redirect({ href: "/admin", locale: await getLocale() });
  return user;
}
/** Default learner guard: Terms accepted (age policy applied there) and onboarding complete. */
export async function requireOnboardedLearner() {
  const user = await requireLearnerAccount();
  if (!learnerOnboarded(user)) redirect({ href: "/onboarding", locale: await getLocale() });
  return user;
}
