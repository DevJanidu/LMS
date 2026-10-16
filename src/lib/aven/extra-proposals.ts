import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError, mutateGoal } from "@/lib/goals/service";
import {
  aiPreferenceSchema,
  notificationPreferenceSchema,
  type AvenProposal,
} from "./validation";
import { applyCalendarProposal } from "./calendar-actions";
import { saveLearningSignal } from "@/lib/learning/server";
export const resourceVersion = (resource: typeof s.resources.$inferSelect) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        subjectId: resource.subjectId,
        topicId: resource.topicId,
        title: resource.title,
        type: resource.type,
        url: resource.url,
        textContent: resource.textContent,
        storageKey: resource.storageKey,
      }),
    )
    .digest("hex");
export async function applyExtraProposal(
  tx: DbTransaction,
  userId: string,
  timezone: string,
  value: AvenProposal,
) {
  if (
    value.kind === "goalPlan" &&
    !value.tasks.length &&
    !value.milestones.length
  ) {
    const goalId = value.goalId ?? crypto.randomUUID();
    await mutateGoal(
      userId,
      {
        operationId: crypto.randomUUID(),
        goalId,
        expectedVersion: value.expectedVersion,
        action: { kind: "goal", value: { ...value.goal, status: "active" } },
      },
      tx,
    );
    return { goalId };
  }
  if (value.kind === "calendarChanges" || value.kind === "calendarCreate")
    return applyCalendarProposal(tx, userId, timezone, value);
  if (value.kind === "goalCompletion" || value.kind === "milestoneCreate") {
    await mutateGoal(
      userId,
      {
        operationId: crypto.randomUUID(),
        goalId: value.goalId,
        expectedVersion: value.expectedVersion,
        action:
          value.kind === "goalCompletion"
            ? { kind: "completion", completed: value.completed }
            : {
                kind: "milestone",
                id: crypto.randomUUID(),
                value: value.value,
              },
      },
      tx,
    );
    return { goalId: value.goalId };
  }
  if (
    value.kind === "studyPreferences" ||
    value.kind === "reminderPreferences"
  ) {
    const patch = Object.fromEntries(
      Object.entries(value.patch).filter(([, v]) => v !== null),
    );
    if (!Object.keys(patch).length) throw new GoalError("invalidProposal");
    if (value.kind === "studyPreferences") {
      const [current] = await tx
        .select()
        .from(s.aiUserPreferences)
        .where(eq(s.aiUserPreferences.userId, userId));
      const next = aiPreferenceSchema.parse({ ...current?.value, ...patch });
      await tx
        .insert(s.aiUserPreferences)
        .values({ userId, value: next })
        .onConflictDoUpdate({
          target: s.aiUserPreferences.userId,
          set: { value: next, updatedAt: new Date() },
        });
    } else {
      const [current] = await tx
        .select()
        .from(s.notificationPreferences)
        .where(eq(s.notificationPreferences.userId, userId));
      const next = notificationPreferenceSchema.parse({
        ...current?.value,
        ...patch,
      });
      await tx
        .insert(s.notificationPreferences)
        .values({ userId, value: next })
        .onConflictDoUpdate({
          target: s.notificationPreferences.userId,
          set: { value: next, nextCheckAt: new Date(), updatedAt: new Date() },
        });
    }
    return {};
  }
  if (value.kind === "memory") {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(s.aiMemory)
      .where(eq(s.aiMemory.userId, userId));
    if (count >= 50) throw new GoalError("limitReached");
    await tx
      .insert(s.aiMemory)
      .values({ userId, content: value.content, source: "user" });
    return {};
  }
  if (value.kind === "learningSignal") {
    await saveLearningSignal(tx, userId, {
      subjectId: value.subjectId,
      topicId: value.topicId,
      level: value.level,
      source: "chat",
    });
    return {};
  }
  if (value.kind === "resourceOrganization") {
    const [record] = await tx
      .select()
      .from(s.resources)
      .where(
        and(
          eq(s.resources.id, value.resourceId),
          eq(s.resources.userId, userId),
        ),
      )
      .for("update");
    if (!record) throw new GoalError("recordUnavailable", 404);
    if (resourceVersion(record) !== value.expectedHash)
      throw new GoalError("conflict", 409);
    const [subject] = await tx
      .select()
      .from(s.subjects)
      .where(
        and(eq(s.subjects.id, value.subjectId), eq(s.subjects.userId, userId)),
      );
    if (!subject) throw new GoalError("recordUnavailable", 404);
    if (value.topicId) {
      const [topic] = await tx
        .select()
        .from(s.topics)
        .where(
          and(
            eq(s.topics.id, value.topicId),
            eq(s.topics.subjectId, value.subjectId),
          ),
        );
      if (!topic) throw new GoalError("recordUnavailable", 404);
    }
    await tx
      .update(s.resources)
      .set({
        subjectId: value.subjectId,
        topicId: value.topicId,
        title: value.title ?? record.title,
      })
      .where(eq(s.resources.id, record.id));
    await tx
      .update(s.users)
      .set({
        updatedAt: sql`greatest(${s.users.updatedAt}+interval '1 millisecond',clock_timestamp())`,
      })
      .where(eq(s.users.id, userId));
    return {};
  }
  return undefined;
}
