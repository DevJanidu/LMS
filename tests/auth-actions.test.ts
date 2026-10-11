import { beforeEach, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ getAuth: vi.fn(), requestPasswordReset: vi.fn(), getEnv: vi.fn(), limit: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), resetPassword: vi.fn(), readUser: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: mocked.getAuth, requireUser: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocked.redirect }));
vi.mock("@/lib/rate-limit", () => ({ requestLimit: mocked.limit }));
vi.mock("@/lib/env", () => ({ getEnv: mocked.getEnv }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: mocked.readUser }) }) }) }));
vi.mock("@/lib/services/workspace", () => ({ getSettings: async () => ({ minimumAge: 0 }) }));
import { authenticate } from "@/app/[locale]/auth-actions";
import { AccountEmailUnavailable } from "@/lib/email/errors";

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getEnv.mockReturnValue({ APP_URL: "http://localhost:3000", RESEND_API_KEY: "fixture-key", EMAIL_FROM: "fixture@example.com" });
  mocked.limit.mockResolvedValue("allowed");
  mocked.getAuth.mockReturnValue({ api: { requestPasswordReset: mocked.requestPasswordReset, signInEmail: mocked.signIn, signUpEmail: mocked.signUp, resetPassword: mocked.resetPassword } });
  mocked.readUser.mockResolvedValue([{ role: "learner", status: "active", onboardingCompletedAt: new Date() }]);
  mocked.signIn.mockResolvedValue({ user: { id: "fixture-user" } });
});
it("returns a friendly login result when auth initialization fails instead of throwing a 500", async () => {
  mocked.getAuth.mockImplementation(() => { throw new Error("Configuration failed"); });
  await expect(authenticate({ mode: "login", email: "fixture@example.com", password: "fixture-password-only" })).resolves.toEqual({ ok: false, error: "authenticationUnavailable" });
});
it("reports pending email setup without pretending a reset email was sent", async () => {
  mocked.getEnv.mockReturnValue({ APP_URL: "http://localhost:3000" });
  await expect(authenticate({ mode: "forgot-password", email: "fixture@example.com" })).resolves.toEqual({ ok: false, error: "emailUnavailable" });
  expect(mocked.requestPasswordReset).not.toHaveBeenCalled();
});
it("does not pretend a reset was sent when the auth service fails", async () => {
  mocked.getAuth.mockImplementation(() => { throw new Error("Provider unavailable"); });
  await expect(authenticate({ mode: "forgot-password", email: "fixture@example.com" })).resolves.toEqual({ ok: false, error: "authenticationUnavailable" });
});
it("reports invalid email and required password separately before contacting auth", async () => {
  expect(await authenticate({ mode: "login", email: "not-an-email", password: "wrong" })).toEqual({ ok: false, error: "invalidEmail", field: "email" });
  expect(await authenticate({ mode: "login", email: "fixture@example.com", password: "" })).toEqual({ ok: false, error: "passwordRequired", field: "password" });
  expect(mocked.getAuth).not.toHaveBeenCalled();
});
it("describes rejected credentials without misidentifying which detail is wrong", async () => {
  mocked.signIn.mockRejectedValue({ body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "private provider detail" } });
  expect(await authenticate({ mode: "login", email: "fixture@example.com", password: "wrong" })).toEqual({ ok: false, error: "invalidCredentials" });
  expect(mocked.readUser).not.toHaveBeenCalled();
});
it("reports email delivery failure rather than returning a false success", async () => {
  mocked.requestPasswordReset.mockRejectedValue(new AccountEmailUnavailable());
  expect(await authenticate({ mode: "forgot-password", email: "fixture@example.com" })).toEqual({ ok: false, error: "emailDeliveryFailed" });
});
it("acknowledges the normalized entered email without disclosing whether it exists", async () => {
  expect(await authenticate({ mode: "forgot-password", email: " Fixture@Example.com " })).toEqual({ ok: true, href: "", email: "fixture@example.com" });
  expect(mocked.requestPasswordReset).toHaveBeenCalledWith(expect.objectContaining({ body: { email: "fixture@example.com", redirectTo: "http://localhost:3000/reset-password" } }));
});
it("offers a fresh link for missing or expired reset tokens", async () => {
  expect(await authenticate({ mode: "reset-password", password: "fixture-password-only" })).toEqual({ ok: false, error: "invalidResetLink" });
  mocked.resetPassword.mockRejectedValue({ body: { code: "INVALID_TOKEN" } });
  expect(await authenticate({ mode: "reset-password", password: "fixture-password-only", token: "fixture-token" })).toEqual({ ok: false, error: "invalidResetLink" });
});
it("redirects a completed password reset to a confirmation on the login page", async () => {
  await authenticate({ mode: "reset-password", password: "fixture-password-only", token: "fixture-token" });
  expect(mocked.redirect).toHaveBeenCalledWith({ href: "/login?reset=success", locale: "en" });
});
it("keeps rate limiting and temporary outages distinct", async () => {
  mocked.limit.mockResolvedValue("limited");
  expect(await authenticate({ mode: "login", email: "fixture@example.com", password: "wrong" })).toEqual({ ok: false, error: "tooManyRequests" });
  mocked.limit.mockResolvedValue("unavailable");
  expect(await authenticate({ mode: "login", email: "fixture@example.com", password: "wrong" })).toEqual({ ok: false, error: "authenticationUnavailable" });
  expect(mocked.signIn).not.toHaveBeenCalled();
});
