import { beforeEach, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
const mocked = vi.hoisted(() => ({
  send: vi.fn(), getEnv: vi.fn(), getLocale: vi.fn(), getTranslations: vi.fn(),
  tasks: [] as (() => Promise<void>)[],
}));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocked.send }; } }));
vi.mock("@/lib/env", () => ({ getEnv: mocked.getEnv }));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => mocked.tasks.push(task) }));
vi.mock("next-intl/server", () => ({ getLocale: mocked.getLocale, getTranslations: mocked.getTranslations }));
import { sendWelcomeEmail, sendAccountEmail } from "@/lib/email";
import { scheduleWelcomeEmail } from "@/lib/email/welcome";

const env = { RESEND_API_KEY: "fixture-resend-key", EMAIL_FROM: "Acadence <hello@acadence.janidudev.com>", APP_URL: "https://acadence.janidudev.com" };
const user = { id: "fixture-user", name: "Sam", email: "fixture@example.com" };
beforeEach(() => {
  vi.clearAllMocks();
  mocked.tasks.length = 0;
  mocked.getEnv.mockReturnValue(env);
  mocked.getLocale.mockResolvedValue("en");
  mocked.getTranslations.mockImplementation(async (options) => typeof options === "string"
    ? createTranslator({ locale: "en", messages: en, namespace: "studyflow" })
    : createTranslator({ locale: options.locale, messages: options.locale === "ar" ? ar : en, namespace: options.namespace }));
  mocked.send.mockResolvedValue({ data: { id: "fixture-email-id" }, error: null });
});
it("sends a personalized welcome with the configured sender, production URL and idempotency key", async () => {
  await sendWelcomeEmail(user, "en");
  expect(mocked.send).toHaveBeenCalledWith(expect.objectContaining({
    from: env.EMAIL_FROM, to: user.email, subject: "Welcome to StudyFlow!",
    text: expect.stringContaining("Thanks for joining StudyFlow!"),
  }), { idempotencyKey: "welcome-user/fixture-user" });
  const text = mocked.send.mock.calls[0][0].text;
  expect(text).toContain("Hi Sam,");
  expect(text).toContain("https://acadence.janidudev.com/onboarding");
});
it("captures the registration language and defers sending until after the response", async () => {
  mocked.getLocale.mockResolvedValue("ar");
  await scheduleWelcomeEmail(user);
  expect(mocked.send).not.toHaveBeenCalled();
  expect(mocked.tasks).toHaveLength(1);
  await mocked.tasks[0]();
  expect(mocked.getTranslations).toHaveBeenCalledWith({ locale: "ar", namespace: "studyflow.accountEmails" });
  expect(mocked.send.mock.calls[0][0].text).toContain("شكرًا لانضمامك");
});
it("keeps registration successful when the provider fails and logs no recipient or provider details", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    mocked.send.mockRejectedValue(new Error(`secret provider detail ${user.email}`));
    await scheduleWelcomeEmail(user);
    await expect(mocked.tasks[0]()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledExactlyOnceWith('{"event":"welcome_email_failed"}');
  } finally { warning.mockRestore(); }
});
it("skips welcome delivery while the Resend API key is pending", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    mocked.getEnv.mockReturnValue({ ...env, RESEND_API_KEY: undefined });
    await expect(scheduleWelcomeEmail(user)).resolves.toBeUndefined();
    expect(mocked.tasks).toHaveLength(0);
    expect(mocked.send).not.toHaveBeenCalled();
  } finally { warning.mockRestore(); }
});
it("rejects failed or unacknowledged sends for all account email types", async () => {
  mocked.send.mockResolvedValue({ data: null, error: { message: "fixture-provider-error" } });
  await expect(sendWelcomeEmail(user, "en")).rejects.toThrow("Welcome email delivery failed.");
  await expect(sendAccountEmail(user.email, "reset", "https://acadence.janidudev.com/reset-password")).rejects.toThrow("Account email delivery failed.");
  mocked.send.mockResolvedValue({ data: null, error: null });
  await expect(sendAccountEmail(user.email, "verify", "https://acadence.janidudev.com/api/auth/verify-email")).rejects.toThrow("Account email delivery failed.");
});
