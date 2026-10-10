import { expect, it } from "vitest";
import { validateEnvironment } from "@/lib/env";

const core = {
  NODE_ENV: "test", DATABASE_URL: "postgresql://fixture:fixture@database.example.com/app", DATABASE_URL_UNPOOLED: "postgresql://fixture:fixture@database.example.com/app",
  AUTH_SECRET: "fixture-auth-secret-with-at-least-32-characters", APP_URL: "http://localhost:3000", CRON_SECRET: "fixture-cron-secret-with-at-least-32-characters",
  OBJECT_STORAGE_ENDPOINT: "https://storage.example.com", OBJECT_STORAGE_REGION: "us-east-2", OBJECT_STORAGE_BUCKET: "fixture", OBJECT_STORAGE_ACCESS_KEY_ID: "fixture-key", OBJECT_STORAGE_SECRET_ACCESS_KEY: "fixture-secret",
};
it("accepts core application configuration while email setup is pending", () => {
  const env = validateEnvironment(core);
  expect(env.DATABASE_URL).toBe(core.DATABASE_URL);
  expect(env.RESEND_API_KEY).toBeUndefined();
  expect(env.EMAIL_FROM).toBeUndefined();
  expect(validateEnvironment({ ...core, RESEND_API_KEY: "", EMAIL_FROM: "" }).RESEND_API_KEY).toBeUndefined();
});
it("requires a sender for an API key and allows a prepared sender while setup is pending", () => {
  expect(() => validateEnvironment({ ...core, RESEND_API_KEY: "fixture-email-key" })).toThrow("Set both email variables");
  expect(validateEnvironment({ ...core, EMAIL_FROM: "Acadence <hello@acadence.janidudev.com>" }).RESEND_API_KEY).toBeUndefined();
  expect(validateEnvironment({ ...core, RESEND_API_KEY: "fixture-email-key", EMAIL_FROM: "fixture@example.com" }).EMAIL_FROM).toBe("fixture@example.com");
});
it("rejects malformed senders and header injection", () => {
  for (const sender of ["not-an-address", "Acadence <broken>", "hello@example.com\r\nBcc: other@example.com"]) {
    expect(() => validateEnvironment({ ...core, EMAIL_FROM: sender })).toThrow("Use an email address");
  }
});
