"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, requireLearner } from "@/lib/auth";
import { operationsSchema } from "@/lib/validation/operations";
import { mutate, deleteAccount, DomainError } from "@/lib/services/mutations";
import { loadWorkspace } from "@/lib/services/workspace";
import { listSessions, sessionFilterSchema, getBlocksInRange, rangeSchema } from "@/lib/services/lists";

function workspaceOptions(scope: unknown, role: string) {
  if (typeof scope === "string" && scope.startsWith("admin:")) {
    const id = z.string().uuid().safeParse(scope.slice(6));
    if (!id.success || role !== "super_admin") throw new DomainError("recordUnavailable");
    return { adminTargetId: id.data };
  }
  return {};
}
export async function mutateWorkspace(input: unknown, scope?: unknown) {
  const user = await requireUser();
  const parsed = operationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try {
    const options = workspaceOptions(scope, user.role);
    const result = await mutate(user.id, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true as const, data: await loadWorkspace(user.id, options), ...result };
  } catch (error) {
    return { ok: false as const, error: error instanceof DomainError ? error.message : "saveFailed" };
  }
}
export async function refreshWorkspace(scope?: unknown) { const user = await requireUser(); return loadWorkspace(user.id, workspaceOptions(scope, user.role)); }
export async function querySessions(input: unknown) {
  const user = await requireLearner();
  const parsed = sessionFilterSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try { return { ok: true as const, data: await listSessions(user.id, user.timezone, parsed.data) }; }
  catch { return { ok: false as const, error: "saveFailed" }; }
}
export async function queryBlocks(input: unknown) {
  const user = await requireLearner(); const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try { return { ok: true as const, data: await getBlocksInRange(user.id, parsed.data) }; }
  catch { return { ok: false as const, error: "saveFailed" }; }
}
export async function deleteMyAccount() {
  const user = await requireLearner();
  try { await deleteAccount(user.id); revalidatePath("/", "layout"); return { ok: true as const }; }
  catch { return { ok: false as const, error: "saveFailed" }; }
}
export async function completeOnboarding() {
  const user = await requireLearner();
  const { getDb } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  try { await getDb().update(users).set({ onboardingCompletedAt: new Date() }).where(eq(users.id, user.id)); revalidatePath("/", "layout"); return { ok: true as const }; }
  catch { return { ok: false as const, error: "saveFailed" }; }
}
export async function searchWorkspace(input: unknown) {
  const user = await requireLearner();
  const parsed = z.string().trim().min(1).max(100).safeParse(input);
  if (!parsed.success) return { subjects: [], topics: [], resources: [] };
  const query = parsed.data;
  const { getDb } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq, ilike } = await import("drizzle-orm");
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const db = getDb();
  const [subjects, topics, resources] = await Promise.all([
    db.select({ id: s.subjects.id, title: s.subjects.title }).from(s.subjects).where(and(eq(s.subjects.userId, user.id), ilike(s.subjects.title, pattern))).limit(20),
    db.select({ id: s.topics.id, subjectId: s.topics.subjectId, title: s.topics.title }).from(s.topics).innerJoin(s.subjects, eq(s.topics.subjectId, s.subjects.id)).where(and(eq(s.subjects.userId, user.id), ilike(s.topics.title, pattern))).limit(20),
    db.select({ id: s.resources.id, title: s.resources.title }).from(s.resources).where(and(eq(s.resources.userId, user.id), ilike(s.resources.title, pattern))).limit(20),
  ]);
  return { subjects, topics, resources };
}

export async function resourceDetail(input: unknown) {
  const user = await requireLearner();
  const id = z.string().uuid().safeParse(input);
  if (!id.success) return { ok: false as const, error: "invalidInput" };
  const { getDb } = await import("@/lib/db");
  const { resources } = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  try {
    const [resource] = await getDb().select({ textContent: resources.textContent }).from(resources).where(and(eq(resources.id, id.data), eq(resources.userId, user.id)));
    if (!resource) return { ok: false as const, error: "recordUnavailable" };
    return { ok: true as const, textContent: resource.textContent ?? undefined };
  } catch { return { ok: false as const, error: "saveFailed" }; }
}
