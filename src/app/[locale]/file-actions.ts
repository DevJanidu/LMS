"use server";
import { requireLearner } from "@/lib/auth";
import { uploadSchema, uuidSchema } from "@/lib/validation";
import { requestUpload, confirmUpload } from "@/lib/services/uploads";
import { DomainError } from "@/lib/services/mutations";
import { requestLimit } from "@/lib/rate-limit";
export async function createUpload(input: unknown) {
  const user = await requireLearner();
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidFileType" };
  const limit = await requestLimit(`upload:${user.id}`, 10);
  if (limit !== "allowed") return { ok: false as const, error: limit === "limited" ? "tooManyRequests" : "authenticationUnavailable" };
  try { return { ok: true as const, data: await requestUpload(user.id, parsed.data) }; }
  catch (error) { return { ok: false as const, error: error instanceof DomainError ? error.message : "uploadFailed" }; }
}
export async function finishUpload(input: unknown) {
  const user = await requireLearner();
  const parsed = uuidSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try { const data = await confirmUpload(user.id, parsed.data); return { ok: true as const, data }; }
  catch (error) { return { ok: false as const, error: error instanceof DomainError ? error.message : "uploadFailed" }; }
}
