import { expect, it } from "vitest";
import { parseAuthInput, validResetToken } from "@/lib/auth/input";
import { authFeedback } from "@/lib/auth/errors";
import { passwordResetLink } from "@/lib/auth/reset-link";

it("requires strong new passwords but lets login report rejected short passwords", () => {
  expect(parseAuthInput({ mode: "login", email: "fixture@example.com", password: "wrong" }).success).toBe(true);
  const result = parseAuthInput({ mode: "reset-password", password: "short", token: "fixture-token" });
  expect(result).toEqual({ success: false, result: { ok: false, error: "passwordTooShort", field: "password" } });
});
it("rejects missing registration consent and invalid birth dates", () => {
  const core = { mode: "register", email: "fixture@example.com", password: "fixture-password", name: "Fixture" };
  expect(parseAuthInput(core)).toEqual({ success: false, result: { ok: false, error: "termsRequired", field: "terms" } });
  expect(parseAuthInput({ ...core, acceptedTerms: true, dateOfBirth: "2999-01-01" })).toEqual({ success: false, result: { ok: false, error: "invalidBirthDate", field: "dob" } });
});
it("maps only known provider codes and does not expose error text", () => {
  expect(authFeedback({ body: { code: "USER_ALREADY_EXISTS" } })).toEqual({ error: "emailAlreadyRegistered", field: "email" });
  expect(authFeedback({ body: { code: "ACCOUNT_INACTIVE" } })).toEqual({ error: "accountInactive" });
  expect(authFeedback(new Error("SQL and connection credentials"))).toEqual({ error: "authenticationUnavailable" });
  expect(authFeedback({ statusCode: 403 })).toEqual({ error: "authenticationUnavailable" });
});
it("builds a direct public reset link and rejects malformed tokens", () => {
  expect(passwordResetLink("https://app.example.com", "fixture-token")).toBe("https://app.example.com/reset-password?token=fixture-token");
  for (const value of [undefined, "", "a/b", "token?evil", "x".repeat(501)]) expect(validResetToken(value)).toBe(false);
});
