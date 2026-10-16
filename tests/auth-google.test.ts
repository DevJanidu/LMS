import { beforeEach, expect, it, vi } from "vitest";
type Hook = (input: Record<string, unknown>, context?: unknown) => Promise<{ data: Record<string, unknown> }>;
interface CapturedOptions {
  emailAndPassword: unknown; session: unknown; onAPIError: { errorURL: string };
  socialProviders: Record<string, unknown>; account: { accountLinking: unknown; updateAccountOnSignIn: boolean };
  advanced: { defaultCookieAttributes: unknown };
  user: { additionalFields: Record<string, { input?: boolean }> };
  databaseHooks: { user: { create: { before: Hook } }; session: { create: { before: Hook } } };
}
const mocked = vi.hoisted(() => ({ options: undefined as CapturedOptions | undefined, status: vi.fn(), after: vi.fn() }));
vi.mock("better-auth", () => ({ betterAuth: (options: unknown) => { mocked.options = options as CapturedOptions; return { api: {} }; } }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }));
vi.mock("better-auth/next-js", () => ({ nextCookies: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ after: mocked.after }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/email/welcome", () => ({ scheduleWelcomeEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({ getAccountEnv: () => ({ APP_URL: "https://study.example.com", AUTH_SECRET: "x".repeat(32), GOOGLE_CLIENT_ID: "fixture-id", GOOGLE_CLIENT_SECRET: "fixture-secret" }) }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: mocked.status }) }) }) }));
import { getAuth } from "@/lib/auth";
import { loginDestination } from "@/lib/auth/destination";
import { signInErrorMessage } from "@/lib/auth/errors";
import { validateAccountEnvironment, InvalidServerConfiguration } from "@/lib/env";
import { onboardingTermsDecision } from "@/lib/validation/onboarding";

const options = () => { getAuth(); return mocked.options!; };
beforeEach(() => { mocked.status.mockReset(); });

it("offers Google as the only sign-in method while keeping session settings", () => {
  const config = options();
  expect(config.emailAndPassword).toEqual({ enabled: false });
  expect(Object.keys(config.socialProviders)).toEqual(["google"]);
  expect(config.socialProviders.google).toEqual({ clientId: "fixture-id", clientSecret: "fixture-secret" });
  // Google is not "trusted": Better Auth links only when Google reports a verified email.
  expect(config.account.accountLinking).toEqual({ enabled: true, requireLocalEmailVerified: false, allowDifferentEmails: false, updateUserInfoOnLink: false });
  expect(config.account.updateAccountOnSignIn).toBe(false);
  expect(config.session).toEqual({ expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } });
  expect(config.advanced.defaultCookieAttributes).toEqual({ httpOnly: true, sameSite: "lax" });
  expect(config.onAPIError.errorURL).toBe("https://study.example.com/login");
  // Profile fields can never be written through the provider or update-user.
  for (const field of ["role", "status", "acceptedTermsAt", "dateOfBirth", "onboardingCompletedAt"]) expect(config.user.additionalFields[field].input, field).toBe(false);
});
it("creates every Google sign-up as an active learner with a lowercase email, never an admin", async () => {
  const before = options().databaseHooks.user.create.before;
  const { data } = await before({ email: " New.Learner@Example.COM ", name: "New Learner", emailVerified: true, role: "super_admin", status: "deactivated" }, null);
  expect(data).toMatchObject({ email: "new.learner@example.com", name: "New Learner", role: "learner", status: "active", emailVerified: true });
  expect(data.acceptedTermsAt).toBeUndefined();
  expect((await before({ email: "noname@example.com", name: "", emailVerified: true }, null)).data.name).toBe("noname");
});
it("refuses to create an account for an unverified Google email", async () => {
  const before = options().databaseHooks.user.create.before;
  for (const emailVerified of [false, undefined, null, "true"]) {
    await expect(before({ email: "squatter@example.com", name: "Squatter", emailVerified }, null)).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } });
  }
});
it("refuses a session for a deactivated account, including after OAuth", async () => {
  const before = options().databaseHooks.session.create.before;
  mocked.status.mockResolvedValue([{ status: "deactivated" }]);
  await expect(before({ userId: "fixture-user" })).rejects.toMatchObject({ body: { code: "ACCOUNT_INACTIVE" } });
  mocked.status.mockResolvedValue([]);
  await expect(before({ userId: "missing-user" })).rejects.toMatchObject({ body: { code: "ACCOUNT_INACTIVE" } });
  mocked.status.mockResolvedValue([{ status: "active" }]);
  await expect(before({ userId: "fixture-user" })).resolves.toEqual({ data: { userId: "fixture-user" } });
});
it("routes Google sign-ins by role and onboarding state", () => {
  expect(loginDestination("learner", false)).toBe("/onboarding");
  expect(loginDestination("learner", false, "/subjects")).toBe("/onboarding");
  expect(loginDestination("learner", true)).toBe("/dashboard");
  expect(loginDestination("super_admin", true)).toBe("/admin");
  expect(loginDestination("learner", true, "/admin")).toBe("/dashboard");
  expect(loginDestination("learner", true, "/admin/users/123")).toBe("/dashboard");
});
it("maps OAuth redirect errors without echoing provider text", () => {
  expect(signInErrorMessage("ACCOUNT_INACTIVE")).toBe("accountInactive");
  expect(signInErrorMessage("agePolicy")).toBe("agePolicy");
  expect(signInErrorMessage("<script>")).toBe("googleSignInFailed");
  expect(signInErrorMessage("EMAIL_NOT_VERIFIED")).toBe("emailNotVerified");
  expect(signInErrorMessage("account_not_linked")).toBe("emailNotVerified");
  expect(signInErrorMessage("ADMIN_LINK_NOT_AUTHORIZED")).toBe("adminLinkNotAuthorized");
  expect(signInErrorMessage("GOOGLE_IDENTITY_ALREADY_LINKED")).toBe("googleIdentityConflict");
  expect(signInErrorMessage(undefined)).toBeUndefined();
});
it("requires both Google OAuth settings and names only the missing fields", async () => {
  const { validateAccountEnvironment: validate, InvalidServerConfiguration: ConfigError } = await vi.importActual<{ validateAccountEnvironment: typeof validateAccountEnvironment; InvalidServerConfiguration: typeof InvalidServerConfiguration }>("@/lib/env");
  const base = { DATABASE_URL: "postgresql://u:p@h/d", AUTH_SECRET: "s".repeat(32), APP_URL: "http://localhost:3000" };
  expect(validate({ ...base, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).GOOGLE_CLIENT_ID).toBe("id");
  for (const input of [base, { ...base, GOOGLE_CLIENT_ID: "secret-looking-id" }, { ...base, GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }]) {
    let error: unknown;
    try { validate(input); } catch (cause) { error = cause; }
    expect(error).toBeInstanceOf(ConfigError);
    const { fields, message } = error as InvalidServerConfiguration;
    expect(fields.every(field => ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].includes(field))).toBe(true);
    expect(fields).toContain("GOOGLE_CLIENT_SECRET");
    expect(message).not.toContain("secret-looking-id");
  }
});
it("records consent in onboarding and closes accounts below the configured age", () => {
  const today = new Date("2026-10-16T12:00:00Z");
  expect(onboardingTermsDecision({ acceptedTerms: false }, 0, today)).toBe("termsRequired");
  expect(onboardingTermsDecision({ acceptedTerms: true }, 0, today)).toBe("accepted");
  expect(onboardingTermsDecision({ acceptedTerms: true, dateOfBirth: "2030-01-01" }, 0, today)).toBe("invalidBirthDate");
  expect(onboardingTermsDecision({ acceptedTerms: true }, 13, today)).toBe("agePolicy");
  expect(onboardingTermsDecision({ acceptedTerms: true, dateOfBirth: "2013-10-17" }, 13, today)).toBe("underage");
  expect(onboardingTermsDecision({ acceptedTerms: true, dateOfBirth: "2013-10-16" }, 13, today)).toBe("accepted");
});
