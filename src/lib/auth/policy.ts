import { APIError } from "better-auth/api";
import { newAccountFields } from "./new-account";

/**
 * Identity and session policy shared by the Better Auth instance and its tests.
 * Kept free of database and Next.js imports so the real Better Auth engine can
 * run it against an in-memory adapter.
 */

/** One-time operator grant that lets a privileged user attach a Google identity. */
export const ADMIN_GOOGLE_LINK_PREFIX = "admin-google-link:";
export const adminGoogleLinkIdentifier = (userId: string) => `${ADMIN_GOOGLE_LINK_PREFIX}${userId}`;

/**
 * Google is deliberately *not* a trusted provider: Better Auth then links an
 * existing account only when Google reports `email_verified: true`.
 * Legacy password-era rows were never email-verified locally; password sign-in
 * is disabled, so whoever created such a row cannot use it, and linking hands it
 * to the verified owner of the address. Privileged rows are additionally gated by
 * `beforeAccountCreate`.
 */
export const accountLinking = { enabled: true, requireLocalEmailVerified: false, allowDifferentEmails: false, updateUserInfoOnLink: false } as const;

/** Learners slide for up to 30 days; administrators re-authenticate every 12 hours. */
export const SESSION_ABSOLUTE_LIFETIME_MS = { learner: 30 * 86_400_000, super_admin: 12 * 3_600_000 } as const;
export function sessionPastAbsoluteLifetime(createdAt: Date | string, role: string, now = Date.now()) {
  const limit = role === "learner" ? SESSION_ABSOLUTE_LIFETIME_MS.learner : SESSION_ABSOLUTE_LIFETIME_MS.super_admin;
  const created = new Date(createdAt).getTime();
  return !Number.isFinite(created) || now - created > limit;
}

const forbidden = (code: string, message: string) => new APIError("FORBIDDEN", { code, message });

/** Every account Better Auth creates is a verified, active learner. */
export async function beforeUserCreate<T extends { email: string; name?: string | null; emailVerified?: boolean }>(user: T) {
  if (user.emailVerified !== true) throw forbidden("EMAIL_NOT_VERIFIED", "A verified Google email address is required.");
  return { data: { ...user, ...newAccountFields(user) } };
}

interface AccountDraft { userId: string; providerId: string; accountId: string }
interface PolicyAdapter {
  findUserById(id: string): Promise<{ id: string; email: string; role?: unknown } | null>;
  findAccounts(userId: string): Promise<Array<{ providerId: string; accountId: string }>>;
  consumeVerificationValue(identifier: string): Promise<{ value: string } | null>;
}
/** `linkedExisting` is false only for the account created together with a new user. */
export interface AccountDecision { linkedExisting: boolean; privileged: boolean }

/**
 * Runs inside Better Auth's transaction for both new sign-ups and implicit links.
 * Fails closed: an unknown context, provider, user or second Google identity is refused.
 */
export async function beforeAccountCreate(account: AccountDraft, context: { context?: { internalAdapter?: unknown } } | null): Promise<AccountDecision> {
  if (account.providerId !== "google") throw forbidden("PROVIDER_NOT_ALLOWED", "Only Google sign-in is available.");
  const adapter = context?.context?.internalAdapter as PolicyAdapter | undefined;
  if (!adapter) throw forbidden("ACCOUNT_POLICY_UNAVAILABLE", "Account policy unavailable.");
  const user = await adapter.findUserById(account.userId);
  if (!user) throw forbidden("ACCOUNT_POLICY_UNAVAILABLE", "Account policy unavailable.");
  const accounts = await adapter.findAccounts(account.userId);
  // A user is bound to one Google `sub`; a different identity with the same
  // email (recycled or re-created address) must not join an existing account.
  if (accounts.some(item => item.providerId === "google" && item.accountId !== account.accountId)) throw forbidden("GOOGLE_IDENTITY_ALREADY_LINKED", "This account is already linked to a different Google identity.");
  if (user.role === "learner") return { linkedExisting: accounts.length > 0, privileged: false };
  // Privileged rows never gain a Google identity from an email match alone.
  const grant = await adapter.consumeVerificationValue(adminGoogleLinkIdentifier(user.id));
  let expected: { email?: string; googleSub?: string } = {};
  try { expected = grant ? JSON.parse(grant.value) : {}; } catch { expected = {}; }
  if (!grant || expected.email !== user.email || (expected.googleSub && expected.googleSub !== account.accountId)) {
    throw forbidden("ADMIN_LINK_NOT_AUTHORIZED", "Administrator Google linking requires operator authorization.");
  }
  return { linkedExisting: true, privileged: true };
}

/** Acadence never calls Google APIs, so provider tokens are not retained. */
export const withoutProviderTokens = <T extends object>(account: T) => ({ ...account, accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null });

/** Learners may use the product only after Terms acceptance and onboarding. */
export function learnerOnboarded(user: { acceptedTermsAt?: Date | string | null; onboardingCompletedAt?: Date | string | null }) {
  return Boolean(user.acceptedTermsAt && user.onboardingCompletedAt);
}
export type LearnerAccessFailure = { status: 401; error: "authenticationFailed" } | { status: 403; error: "recordUnavailable" | "onboardingRequired" };
/** Shared decision for JSON APIs; pages and actions redirect through `requireOnboardedLearner`. */
export function learnerAccessFailure(user: { role: string; acceptedTermsAt?: Date | string | null; onboardingCompletedAt?: Date | string | null } | null): LearnerAccessFailure | undefined {
  if (!user) return { status: 401, error: "authenticationFailed" };
  if (user.role !== "learner") return { status: 403, error: "recordUnavailable" };
  if (!learnerOnboarded(user)) return { status: 403, error: "onboardingRequired" };
  return undefined;
}
