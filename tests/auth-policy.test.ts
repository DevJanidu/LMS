import { afterEach, expect, it, vi } from "vitest";
import { beforeAccountCreate, learnerAccessFailure, sessionPastAbsoluteLifetime, withoutProviderTokens } from "@/lib/auth/policy";
import { authEvent, libraryLog } from "@/lib/auth/events";
import { contentSecurityPolicy, THEME_SCRIPT, THEME_SCRIPT_HASH } from "@/lib/security/csp";
import { createHash } from "node:crypto";

afterEach(() => { vi.restoreAllMocks(); });
const onboarded = { role: "learner", acceptedTermsAt: new Date(), onboardingCompletedAt: new Date() };

it("separates signed out (401), other roles and unfinished onboarding (403)", () => {
  expect(learnerAccessFailure(null)).toEqual({ status: 401, error: "authenticationFailed" });
  expect(learnerAccessFailure({ ...onboarded, role: "super_admin" })).toEqual({ status: 403, error: "recordUnavailable" });
  expect(learnerAccessFailure({ ...onboarded, acceptedTermsAt: null })).toEqual({ status: 403, error: "onboardingRequired" });
  expect(learnerAccessFailure({ ...onboarded, onboardingCompletedAt: null })).toEqual({ status: 403, error: "onboardingRequired" });
  expect(learnerAccessFailure(onboarded)).toBeUndefined();
});

it("caps sessions at 30 days for learners and 12 hours for administrators, failing closed", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  expect(sessionPastAbsoluteLifetime(new Date(now - 29 * 86_400_000), "learner", now)).toBe(false);
  expect(sessionPastAbsoluteLifetime(new Date(now - 31 * 86_400_000), "learner", now)).toBe(true);
  expect(sessionPastAbsoluteLifetime(new Date(now - 11 * 3_600_000), "super_admin", now)).toBe(false);
  expect(sessionPastAbsoluteLifetime(new Date(now - 13 * 3_600_000), "super_admin", now)).toBe(true);
  // Unknown roles get the strictest limit; unreadable timestamps are expired.
  expect(sessionPastAbsoluteLifetime(new Date(now - 13 * 3_600_000), "unknown", now)).toBe(true);
  expect(sessionPastAbsoluteLifetime("not-a-date", "learner", now)).toBe(true);
});

it("refuses non-Google providers and runs only with Better Auth's transaction context", async () => {
  const account = { userId: "u", providerId: "google", accountId: "1" };
  await expect(beforeAccountCreate({ ...account, providerId: "credential" }, null)).rejects.toMatchObject({ body: { code: "PROVIDER_NOT_ALLOWED" } });
  await expect(beforeAccountCreate(account, null)).rejects.toMatchObject({ body: { code: "ACCOUNT_POLICY_UNAVAILABLE" } });
  const adapter = { findUserById: async () => null, findAccounts: async () => [], consumeVerificationValue: async () => null };
  await expect(beforeAccountCreate(account, { context: { internalAdapter: adapter } })).rejects.toMatchObject({ body: { code: "ACCOUNT_POLICY_UNAVAILABLE" } });
});

it("strips every provider token from stored accounts", () => {
  expect(withoutProviderTokens({ accountId: "1", accessToken: "a", refreshToken: "r", idToken: "i", accessTokenExpiresAt: new Date(), scope: "openid" }))
    .toEqual({ accountId: "1", scope: "openid", accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null });
});

it("writes only allowlisted identifiers to the security log", () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  authEvent("auth.sign_in", { userId: "00000000-0000-4000-8000-000000000001", role: "learner", reason: "ok" });
  authEvent("auth.sign_in", { userId: "attacker@example.com", role: "root", reason: "token=ya29.secret value" } as never);
  libraryLog("error", "Unable to link account\nsecond line ".repeat(30));
  const lines = [...info.mock.calls, ...warn.mock.calls].map(call => JSON.parse(String(call[0])));
  expect(lines[0]).toMatchObject({ event: "auth.sign_in", userId: "00000000-0000-4000-8000-000000000001", role: "learner", reason: "ok" });
  expect(lines[1]).toEqual({ event: "auth.sign_in", at: expect.any(String), reason: "other" });
  expect(JSON.stringify(lines)).not.toMatch(/attacker|ya29|secret|\\n/);
  expect(lines.at(-1).message.length).toBeLessThanOrEqual(160);
});

it("allows only nonce-marked scripts and the exact theme script on dynamic pages", () => {
  const strict = contentSecurityPolicy({ nonce: "Zml4dHVyZQ==" });
  const script = strict.split("; ").find(part => part.startsWith("script-src"));
  expect(script).toBe(`script-src 'self' 'nonce-Zml4dHVyZQ==' ${THEME_SCRIPT_HASH}`);
  expect(THEME_SCRIPT_HASH).toBe(`'sha256-${createHash("sha256").update(THEME_SCRIPT).digest("base64")}'`);
  expect(strict).toContain("frame-ancestors 'none'");
  expect(contentSecurityPolicy({})).toContain("script-src 'self' 'unsafe-inline'");
  expect(contentSecurityPolicy({ nonce: "n", development: true })).toContain("'unsafe-eval'");
  expect(contentSecurityPolicy({ nonce: "n" })).not.toContain("unsafe-eval");
});
