"use server";
import { requireLearner } from "@/lib/auth";
import { uploadSchema, uuidSchema } from "@/lib/validation";
import { requestUpload, confirmUpload } from "@/lib/services/uploads";
import { DomainError } from "@/lib/services/mutations";
import { allowRequest } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";
export async function createUpload(input: unknown) {
  const user = await requireLearner();
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidFileType" };
  if (!(await allowRequest(`upload:${user.id}`, 10))) return { ok: false as const, error: "tooManyRequests" };
  try { return { ok: true as const, data: await requestUpload(user.id, parsed.data) }; }
  catch (error) { return { ok: false as const, error: error instanceof DomainError ? error.message : "uploadFailed" }; }
}
export async function finishUpload(input: unknown) {
  const user = await requireLearner();
  const parsed = uuidSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try { await confirmUpload(user.id, parsed.data); revalidatePath("/", "layout"); return { ok: true as const }; }
  catch (error) { return { ok: false as const, error: error instanceof DomainError ? error.message : "uploadFailed" }; }
}
