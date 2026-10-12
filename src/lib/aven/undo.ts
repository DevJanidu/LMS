import "server-only";
import { and, eq } from "drizzle-orm";
import type { DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError } from "@/lib/goals/service";
import { applyCalendarProposal } from "./calendar-actions";
import {
  aiPreferenceSchema,
  notificationPreferenceSchema,
  type AvenProposal,
} from "./validation";
export interface PreferenceUndo {
  kind: "studyPreferences" | "reminderPreferences";
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}
export interface CalendarUndo {
  kind: "calendarMoves";
  timezone: string;
  changes: Extract<AvenProposal, { kind: "calendarChanges" }>["changes"];
}
export type ProposalUndo = PreferenceUndo | CalendarUndo;
export async function captureUndo(
  tx: DbTransaction,
  userId: string,
  value: AvenProposal,
): Promise<PreferenceUndo | undefined> {
  if (value.kind !== "studyPreferences" && value.kind !== "reminderPreferences")
    return;
  const table =
    value.kind === "studyPreferences"
      ? s.aiUserPreferences
      : s.notificationPreferences;
  const [row] = await tx.select().from(table).where(eq(table.userId, userId));
  const parsed =
    value.kind === "studyPreferences"
      ? aiPreferenceSchema.parse(row?.value ?? {})
      : notificationPreferenceSchema.parse(row?.value ?? {});
  const before = Object.fromEntries(
    Object.keys(value.patch)
      .filter((key) => value.patch[key as keyof typeof value.patch] !== null)
      .map((key) => [key, (parsed as unknown as Record<string, unknown>)[key]]),
  );
  return {
    kind: value.kind,
    before,
    after: Object.fromEntries(
      Object.entries(value.patch).filter(([, item]) => item !== null),
    ),
  };
}
export async function undoPreferences(
  tx: DbTransaction,
  userId: string,
  value: PreferenceUndo,
) {
  const table =
    value.kind === "studyPreferences"
      ? s.aiUserPreferences
      : s.notificationPreferences;
  const [row] = await tx.select().from(table).where(eq(table.userId, userId));
  if (!row) throw new GoalError("recordUnavailable", 404);
  const current = row.value as unknown as Record<string, unknown>;
  if (
    Object.entries(value.after).some(
      ([key, item]) => JSON.stringify(current[key]) !== JSON.stringify(item),
    )
  )
    throw new GoalError("conflict", 409);
  const next = { ...current, ...value.before };
  if (value.kind === "studyPreferences")
    await tx
      .update(s.aiUserPreferences)
      .set({ value: aiPreferenceSchema.parse(next), updatedAt: new Date() })
      .where(eq(s.aiUserPreferences.userId, userId));
  else
    await tx
      .update(s.notificationPreferences)
      .set({
        value: notificationPreferenceSchema.parse(next),
        updatedAt: new Date(),
        nextCheckAt: new Date(),
      })
      .where(eq(s.notificationPreferences.userId, userId));
}
export async function undoProposal(
  tx: DbTransaction,
  userId: string,
  id: string,
) {
  const [proposal] = await tx
    .select()
    .from(s.aiPlanProposals)
    .where(
      and(eq(s.aiPlanProposals.id, id), eq(s.aiPlanProposals.userId, userId)),
    )
    .for("update");
  if (!proposal) throw new GoalError("recordUnavailable", 404);
  if (proposal.status === "undone")
    return { status: "undone", result: proposal.result };
  if (proposal.status !== "approved" || !proposal.result?.undo)
    throw new GoalError("undoUnavailable", 409);
  if (
    !proposal.resolvedAt ||
    Date.now() - proposal.resolvedAt.getTime() > 86400000
  )
    throw new GoalError("proposalExpired", 409);
  if (proposal.result.undo.kind === "calendarMoves") {
    const [actor] = await tx
      .select({ timezone: s.users.timezone })
      .from(s.users)
      .where(eq(s.users.id, userId));
    if (actor.timezone !== proposal.result.undo.timezone)
      throw new GoalError("conflict", 409);
    await applyCalendarProposal(tx, userId, proposal.result.undo.timezone, {
      kind: "calendarChanges",
      explanation: "Undo approved schedule move",
      changes: proposal.result.undo.changes,
    });
  } else await undoPreferences(tx, userId, proposal.result.undo);
  await tx
    .update(s.aiPlanProposals)
    .set({ status: "undone" })
    .where(eq(s.aiPlanProposals.id, id));
  await tx.insert(s.auditLogs).values({
    actorUserId: userId,
    action: "aven.proposal.undo",
    targetType: "aiProposal",
    targetId: id,
    metadata: { kind: proposal.value.kind },
  });
  return { status: "undone", result: proposal.result };
}
