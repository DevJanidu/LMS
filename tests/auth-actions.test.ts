import { beforeEach, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ getAuth: vi.fn(), requestPasswordReset: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: mocked.getAuth, requireUser: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ requestLimit: async () => "allowed" }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "http://localhost:3000" }) }));
import { authenticate } from "@/app/[locale]/auth-actions";

beforeEach(() => vi.clearAllMocks());
it("returns a friendly login result when auth initialization fails instead of throwing a 500", async () => {
  mocked.getAuth.mockImplementation(() => { throw new Error("Configuration failed"); });
  await expect(authenticate({ mode: "login", email: "fixture@example.com", password: "fixture-password-only" })).resolves.toEqual({ ok: false, error: "authenticationFailed" });
});
it("reports pending email setup without pretending a reset email was sent", async () => {
  mocked.getAuth.mockReturnValue({ api: { requestPasswordReset: mocked.requestPasswordReset } });
  await expect(authenticate({ mode: "forgot-password", email: "fixture@example.com" })).resolves.toEqual({ ok: false, error: "emailUnavailable" });
  expect(mocked.requestPasswordReset).not.toHaveBeenCalled();
});
it("keeps reset acknowledgements generic when the provider fails", async () => {
  mocked.getAuth.mockImplementation(() => { throw new Error("Provider unavailable"); });
  await expect(authenticate({ mode: "forgot-password", email: "fixture@example.com" })).resolves.toEqual({ ok: true, href: "" });
});
