"use server";
import { revalidatePath } from "next/cache";
import { requireLearner, requireAdmin } from "@/lib/auth";
import { deleteAccount } from "@/lib/services/mutations";
import * as reads from "@/lib/services/workspace-reads";
import { onboardingSchema } from "@/lib/validation/onboarding";

export async function querySessions(input: unknown) { return reads.querySessions(await requireLearner(), input); }

export async function queryBlocks(input: unknown) { return reads.queryBlocks(await requireLearner(), input); }

export async function deleteMyAccount() {
  const user = await requireLearner();
  // The client exits the authenticated tree after confirmation. Revalidating
  // that tree here would rerender it using an account that has just been removed.
  try { await deleteAccount(user.id); return { ok: true as const }; }
  catch { return { ok: false as const, error: "saveFailed" }; }
}
export async function completeOnboarding(input: unknown) {
  const user = await requireLearner();
  const { getDb } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  const { and, asc, count, eq } = await import("drizzle-orm");
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalidInput" };
  try {
    await getDb().transaction(async (tx) => {
      const [account] = await tx.select({ id: schema.users.id, status: schema.users.status, role: schema.users.role, onboardingCompletedAt: schema.users.onboardingCompletedAt })
        .from(schema.users).where(eq(schema.users.id, user.id)).for("update");
      if (!account || account.status !== "active" || account.role !== "learner") throw new Error("accountInactive");
      if (account.onboardingCompletedAt) return;
      const title = parsed.data.subjectTitle.trim();
      let subjectId: string | undefined;
      if (title) {
        const [subject] = await tx.insert(schema.subjects).values({ id: crypto.randomUUID(), userId: user.id, title, description: "", displayColor: "brand", status: "active" }).returning({ id: schema.subjects.id });
        subjectId = subject.id;
      } else {
        const [subject] = await tx.select({ id: schema.subjects.id }).from(schema.subjects)
          .where(and(eq(schema.subjects.userId, user.id), eq(schema.subjects.status, "active"))).orderBy(asc(schema.subjects.createdAt)).limit(1);
        subjectId = subject?.id;
      }
      if (parsed.data.topicTitles.length && !subjectId) throw new Error("invalidInput");
      if (subjectId && parsed.data.topicTitles.length) {
        const [existing] = await tx.select({ count: count() }).from(schema.topics).where(eq(schema.topics.subjectId, subjectId));
        if (existing.count + parsed.data.topicTitles.length > 200) throw new Error("topicLimit");
        await tx.insert(schema.topics).values(parsed.data.topicTitles.map((topic, index) => ({ id: crypto.randomUUID(), subjectId: subjectId!, title: topic, status: "not_started" as const, sortOrder: existing.count + index })));
      }
      const now = new Date();
      await tx.insert(schema.preferences).values({ userId: user.id, weeklyTargetMinutes: Math.round(parsed.data.weeklyTargetHours * 60) }).onConflictDoUpdate({ target: schema.preferences.userId, set: { weeklyTargetMinutes: Math.round(parsed.data.weeklyTargetHours * 60) } });
      await tx.update(schema.users).set({ learningContext: parsed.data.learningContext, onboardingCompletedAt: now, lastActiveAt: now, updatedAt: now }).where(and(eq(schema.users.id, user.id), eq(schema.users.status, "active")));
    });
    revalidatePath("/", "layout");
    return { ok: true as const };
  }
  catch (error) {
    const message = error instanceof Error ? error.message : "saveFailed";
    return { ok: false as const, error: message === "accountInactive" || message === "invalidInput" || message === "topicLimit" ? message : "saveFailed" };
  }
}
export async function searchWorkspace(input: unknown) { return reads.searchWorkspace(await requireLearner(), input); }

export async function resourceDetail(input: unknown) { return reads.resourceDetail(await requireLearner(), input); }

export async function queryResources(input: unknown) { return reads.queryResources(await requireLearner(), input); }

export async function queryAdminUsers(input: unknown) { return reads.queryAdminUsers(await requireAdmin(), input); }
