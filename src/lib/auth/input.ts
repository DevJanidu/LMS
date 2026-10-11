import { z } from "zod";

export type AuthMode = "login" | "register" | "forgot-password" | "reset-password";
export type AuthField = "email" | "password" | "confirmation" | "name" | "terms" | "dob";
export type AuthFailure = { ok: false; error: string; field?: AuthField };
export type AuthResult = AuthFailure | { ok: true; href: string; email?: string };

const inputSchema = z.object({
  mode: z.enum(["login", "register", "forgot-password", "reset-password"]),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  name: z.string().trim().min(1).max(150).optional(),
  password: z.string().max(128).optional(), acceptedTerms: z.boolean().optional(),
  dateOfBirth: z.iso.date().optional(), token: z.string().max(500).optional(),
  returnTo: z.string().max(2048).optional(),
});

export function validResetToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{1,500}$/.test(token);
}

/** Shared browser/server validation produces actionable errors before auth/network calls. */
export function parseAuthInput(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  const fail = (error: string, field?: AuthField) => ({ success: false as const, result: { ok: false as const, error, ...(field ? { field } : {}) } });
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path[0];
    if (path === "email") return fail("invalidEmail", "email");
    if (path === "password") return fail("passwordTooLong", "password");
    if (path === "name") return fail("nameRequired", "name");
    if (path === "dateOfBirth") return fail("invalidBirthDate", "dob");
    if (path === "token") return fail("invalidResetLink");
    return fail("invalidInput");
  }
  const v = parsed.data;
  if (v.mode !== "reset-password" && !v.email) return fail("invalidEmail", "email");
  if (v.mode !== "forgot-password" && !v.password) return fail("passwordRequired", "password");
  if (["register", "reset-password"].includes(v.mode) && v.password!.length < 8) return fail("passwordTooShort", "password");
  if (v.mode === "register") {
    if (!v.name) return fail("nameRequired", "name");
    if (!v.acceptedTerms) return fail("termsRequired", "terms");
    if (v.dateOfBirth && v.dateOfBirth > new Date().toISOString().slice(0, 10)) return fail("invalidBirthDate", "dob");
  }
  if (v.mode === "reset-password" && !validResetToken(v.token)) return fail("invalidResetLink");
  return { success: true as const, data: v };
}
