import "server-only";
import { and, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getGoalDetail, GoalError } from "@/lib/goals/service";
import { milestoneSchema, taskSchema, goalSchema } from "@/lib/goals/validation";
import { subjectRecord, topicRecord } from "@/lib/services/mutation-records";
import { urlSchema } from "@/lib/validation";
import type { Operation } from "@/lib/validation/operations";
import type { Precondition } from "@/lib/workspace/preconditions";
import { resolveOwnedSubject } from "@/lib/learning/server";
import { sanitizeLabel } from "./mentions";
/**
 * Aven's create/update/delete requests for subjects, topics, library links and goal
 * items. Each builder reads the current owned records and returns a reviewable proposal:
 * exact operations for the application's own services plus preconditions, so an
 * approval fails safely if the record changed in the meantime. Nothing is written here.
 */
const nullableDate = z.iso.date().nullable();
const uuidOrNull = z.uuid().nullable();
const text = z.string().max(150).nullable();
export const manageSubjectsSchema = z.object({
  changes: z
    .array(
      z.object({
        action: z.enum(["create", "update", "archive", "restore", "delete"]),
        subjectId: uuidOrNull.describe("Required except for create."),
        title: text,
        description: z.string().max(2000).nullable(),
        targetDate: nullableDate,
      }),
    )
    .min(1)
    .max(10),
  explanation: z.string().min(1).max(4000),
});
export const manageTopicsSchema = z.object({
  changes: z
    .array(
      z.object({
        action: z.enum(["create", "update", "complete", "reopen", "delete"]),
        topicId: uuidOrNull.describe("Required except for create."),
        subjectId: uuidOrNull.describe("For create; or give subjectName."),
        subjectName: text,
        title: text,
        targetDate: nullableDate,
      }),
    )
    .min(1)
    .max(30),
  explanation: z.string().min(1).max(4000),
});
export const manageLibrarySchema = z.object({
  changes: z
    .array(
      z.object({
        action: z.enum(["addLink", "delete"]),
        resourceId: uuidOrNull.describe("Required for delete."),
        subjectId: uuidOrNull,
        subjectName: text,
        topicId: uuidOrNull,
        title: text,
        url: z.string().max(2048).nullable().describe("http(s) link for addLink."),
      }),
    )
    .min(1)
    .max(10),
  explanation: z.string().min(1).max(4000),
});
export const manageGoalSchema = z.object({
  goalId: z.uuid(),
  changes: z
    .array(
      z.object({
        action: z.enum([
          "updateGoal", "deleteGoal", "updateMilestone", "deleteMilestone", "reorderMilestones",
          "completeTask", "reopenTask", "rescheduleTask", "updateTask", "deleteTask",
        ]),
        id: uuidOrNull.describe("Milestone or task ID for item actions."),
        title: z.string().max(200).nullable(),
        dueDate: nullableDate.describe("Goal target date, milestone or task due date."),
        priority: z.enum(["low", "normal", "high"]).nullable(),
        order: z.array(z.uuid()).max(50).nullable().describe("reorderMilestones: every milestone ID in the new order."),
      }),
    )
    .min(1)
    .max(20),
  explanation: z.string().min(1).max(4000),
});
type Summary = { action: string; entity: string; title: string };
/** Destructive or broad changes need a second, explicit confirmation when approved. */
const highImpact = (summary: Summary[]) =>
  summary.some((item) => item.action === "delete" && ["subject", "goal"].includes(item.entity)) ||
  summary.filter((item) => item.action === "delete").length > 3;
const fresh = () => crypto.randomUUID();
const need = <T>(value: T | null | undefined, code = "invalidToolInput"): T => {
  if (value === null || value === undefined || value === "") throw new GoalError(code);
  return value;
};
async function ownedSubjects(userId: string, ids: string[]) {
  return ids.length
    ? getDb().select().from(s.subjects).where(and(eq(s.subjects.userId, userId), inArray(s.subjects.id, ids)))
    : [];
}
async function ownedTopics(userId: string, ids: string[]) {
  return ids.length
    ? (
        await getDb()
          .select({ topic: s.topics })
          .from(s.topics)
          .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
          .where(and(eq(s.subjects.userId, userId), inArray(s.topics.id, ids)))
      ).map((row) => row.topic)
    : [];
}
export async function subjectProposal(userId: string, input: z.infer<typeof manageSubjectsSchema>) {
  const rows = await ownedSubjects(userId, input.changes.flatMap((c) => (c.subjectId ? [c.subjectId] : [])));
  const operations: Operation[] = [],
    preconditions: Precondition[] = [],
    summary: Summary[] = [];
  for (const change of input.changes) {
    if (change.action === "create") {
      const id = fresh();
      operations.push({
        kind: "subject",
        value: { id, title: need(change.title), description: change.description ?? "", color: "brand", targetDate: change.targetDate ?? undefined, status: "active" },
      });
      preconditions.push({ kind: "subject", id, values: null });
      summary.push({ action: "create", entity: "subject", title: change.title! });
      continue;
    }
    const row = rows.find((item) => item.id === change.subjectId);
    if (!row) throw new GoalError("recordUnavailable", 404);
    const current = subjectRecord(row);
    preconditions.push({ kind: "subject", id: row.id, values: { updatedAt: current.updatedAt } });
    if (change.action === "delete") operations.push({ kind: "delete", entity: "subject", id: row.id });
    else
      operations.push({
        kind: "subject",
        value: {
          id: row.id,
          title: change.title ?? current.title,
          description: change.description ?? current.description,
          color: current.color,
          targetDate: change.targetDate ?? current.targetDate,
          status: change.action === "archive" ? "archived" : change.action === "restore" ? "active" : current.status,
        },
      });
    summary.push({ action: change.action, entity: "subject", title: row.title });
  }
  return workspaceProposal(input.explanation, operations, preconditions, summary);
}
export async function topicProposal(userId: string, input: z.infer<typeof manageTopicsSchema>) {
  const rows = await ownedTopics(userId, input.changes.flatMap((c) => (c.topicId ? [c.topicId] : [])));
  const operations: Operation[] = [],
    preconditions: Precondition[] = [],
    summary: Summary[] = [];
  const nextOrder = new Map<string, number>();
  for (const change of input.changes) {
    if (change.action === "create") {
      const subject = await resolveOwnedSubject(userId, change.subjectId, change.subjectName);
      if (!nextOrder.has(subject.id)) {
        const [{ highest }] = await getDb()
          .select({ highest: max(s.topics.sortOrder) })
          .from(s.topics)
          .where(eq(s.topics.subjectId, subject.id));
        nextOrder.set(subject.id, (highest ?? -1) + 1);
      }
      const sortOrder = nextOrder.get(subject.id)!;
      if (sortOrder > 199) throw new GoalError("limitReached");
      nextOrder.set(subject.id, sortOrder + 1);
      const id = fresh();
      operations.push({
        kind: "topic",
        value: { id, subjectId: subject.id, title: need(change.title), status: "notStarted", targetDate: change.targetDate ?? undefined, sortOrder },
      });
      preconditions.push({ kind: "topic", id, values: null });
      summary.push({ action: "create", entity: "topic", title: `${change.title} · ${sanitizeLabel(subject.title)}` });
      continue;
    }
    const row = rows.find((item) => item.id === change.topicId);
    if (!row) throw new GoalError("recordUnavailable", 404);
    const current = topicRecord(row);
    preconditions.push({ kind: "topic", id: row.id, values: { updatedAt: current.updatedAt } });
    if (change.action === "delete") operations.push({ kind: "delete", entity: "topic", id: row.id });
    else
      operations.push({
        kind: "topic",
        value: {
          id: row.id,
          subjectId: row.subjectId,
          title: change.title ?? current.title,
          description: current.description,
          status: change.action === "complete" ? "completed" : change.action === "reopen" ? "inProgress" : current.status,
          targetDate: change.targetDate ?? current.targetDate,
          sortOrder: current.sortOrder,
          archived: current.archived,
        },
      });
    summary.push({ action: change.action, entity: "topic", title: row.title });
  }
  return workspaceProposal(input.explanation, operations, preconditions, summary);
}
export async function libraryProposal(userId: string, input: z.infer<typeof manageLibrarySchema>) {
  const db = getDb();
  const ids = input.changes.flatMap((c) => (c.resourceId ? [c.resourceId] : []));
  const rows = ids.length
    ? await db.select().from(s.resources).where(and(eq(s.resources.userId, userId), inArray(s.resources.id, ids)))
    : [];
  const operations: Operation[] = [],
    preconditions: Precondition[] = [],
    summary: Summary[] = [];
  for (const change of input.changes) {
    if (change.action === "addLink") {
      const url = urlSchema.safeParse(change.url);
      if (!url.success) throw new GoalError("invalidUrl");
      const subject = await resolveOwnedSubject(userId, change.subjectId, change.subjectName);
      if (change.topicId && !(await ownedTopics(userId, [change.topicId])).some((t) => t.subjectId === subject.id))
        throw new GoalError("recordUnavailable", 404);
      const id = fresh();
      operations.push({
        kind: "resource",
        value: { id, subjectId: subject.id, topicId: change.topicId ?? undefined, type: "link", title: need(change.title), url: url.data },
      });
      preconditions.push({ kind: "resource", id, values: null });
      summary.push({ action: "create", entity: "resource", title: change.title! });
      continue;
    }
    const row = rows.find((item) => item.id === change.resourceId);
    if (!row) throw new GoalError("recordUnavailable", 404);
    operations.push({ kind: "delete", entity: "resource", id: row.id });
    preconditions.push({ kind: "resource", id: row.id, values: { title: row.title, subjectId: row.subjectId } });
    summary.push({ action: "delete", entity: "resource", title: row.title });
  }
  return workspaceProposal(input.explanation, operations, preconditions, summary);
}
function workspaceProposal(
  explanation: string,
  operations: Operation[],
  preconditions: Precondition[],
  summary: Summary[],
) {
  return {
    kind: "workspace" as const,
    explanation,
    impact: highImpact(summary) ? ("high" as const) : ("standard" as const),
    summary: summary.map((item) => ({ ...item, title: sanitizeLabel(item.title) })),
    operations,
    preconditions,
  };
}
type GoalAction =
  | { kind: "goal"; value: z.infer<typeof goalSchema> }
  | { kind: "deleteGoal" }
  | { kind: "milestone"; id: string; value: z.infer<typeof milestoneSchema> }
  | { kind: "deleteMilestone"; id: string }
  | { kind: "task"; id: string; value: z.infer<typeof taskSchema> }
  | { kind: "deleteTask"; id: string };
export async function goalChangesProposal(userId: string, input: z.infer<typeof manageGoalSchema>) {
  const detail = await getGoalDetail(userId, input.goalId);
  const actions: GoalAction[] = [],
    summary: Summary[] = [];
  const milestone = (id: string | null) => {
    const found = detail.milestones.find((m) => m.id === id);
    if (!found) throw new GoalError("recordUnavailable", 404);
    return found;
  };
  const task = (id: string | null) => {
    const found = detail.tasks.find((t) => t.id === id);
    if (!found) throw new GoalError("recordUnavailable", 404);
    return found;
  };
  for (const change of input.changes) {
    switch (change.action) {
      case "updateGoal":
        actions.push({
          kind: "goal",
          value: goalSchema.parse({
            ...detail.goal,
            title: change.title ?? detail.goal.title,
            targetDate: change.dueDate ?? detail.goal.targetDate,
            priority: change.priority ?? detail.goal.priority,
          }),
        });
        summary.push({ action: "update", entity: "goal", title: detail.goal.title });
        break;
      case "deleteGoal":
        actions.push({ kind: "deleteGoal" });
        summary.push({ action: "delete", entity: "goal", title: detail.goal.title });
        break;
      case "updateMilestone": {
        const item = milestone(change.id);
        actions.push({
          kind: "milestone",
          id: item.id,
          value: milestoneSchema.parse({ ...item, title: change.title ?? item.title, dueDate: change.dueDate ?? item.dueDate }),
        });
        summary.push({ action: "update", entity: "milestone", title: item.title });
        break;
      }
      case "deleteMilestone": {
        const item = milestone(change.id);
        actions.push({ kind: "deleteMilestone", id: item.id });
        summary.push({ action: "delete", entity: "milestone", title: item.title });
        break;
      }
      case "reorderMilestones": {
        const order = need(change.order);
        if (order.length !== detail.milestones.length || detail.milestones.some((m) => !order.includes(m.id)))
          throw new GoalError("invalidToolInput");
        order.forEach((id, index) => {
          const item = milestone(id);
          if (item.sortOrder !== index)
            actions.push({ kind: "milestone", id, value: milestoneSchema.parse({ ...item, sortOrder: index }) });
        });
        summary.push({ action: "reorder", entity: "milestone", title: detail.goal.title });
        break;
      }
      case "completeTask":
      case "reopenTask":
      case "rescheduleTask":
      case "updateTask": {
        const item = task(change.id);
        actions.push({
          kind: "task",
          id: item.id,
          value: taskSchema.parse({
            ...item,
            status: change.action === "completeTask" ? "completed" : change.action === "reopenTask" ? "todo" : item.status,
            dueDate: change.dueDate ?? item.dueDate,
            title: change.title ?? item.title,
            priority: change.priority ?? item.priority,
          }),
        });
        summary.push({
          action: { completeTask: "complete", reopenTask: "reopen", rescheduleTask: "reschedule", updateTask: "update" }[change.action],
          entity: "task",
          title: item.title,
        });
        break;
      }
      case "deleteTask": {
        const item = task(change.id);
        actions.push({ kind: "deleteTask", id: item.id });
        summary.push({ action: "delete", entity: "task", title: item.title });
        break;
      }
    }
  }
  if (actions.some((a) => a.kind === "deleteGoal") && actions.length > 1)
    throw new GoalError("invalidToolInput");
  if (!actions.length) throw new GoalError("noChanges");
  return {
    kind: "goalChanges" as const,
    goalId: detail.goal.id,
    expectedVersion: detail.goal.version,
    explanation: input.explanation,
    impact: highImpact(summary) ? ("high" as const) : ("standard" as const),
    summary: summary.map((item) => ({ ...item, title: sanitizeLabel(item.title) })),
    actions,
  };
}
