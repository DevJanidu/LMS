import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import {
  getGoalDetail,
  goalReferences,
  listGoals,
  GoalError,
} from "@/lib/goals/service";
import { getScheduleBlocksInRange } from "@/lib/services/lists";
import { getCalendarBlock } from "@/lib/services/calendar";
import { getOccurrences } from "@/lib/schedule";
import { localDay, shiftDay } from "@/lib/analytics";
import { taskSchema, goalSchema } from "@/lib/goals/validation";
import { goalPlanSchema } from "./validation";
import { getAvenPreferences } from "./preferences";
import { proposeAdaptiveSchedule } from "./planning";
import { storeProposal } from "./proposals";
import { readLearningLink } from "./resource-network";
import { processPdf } from "./documents";
const empty = z.object({}),
  goalIdSchema = z.object({ goalId: z.uuid() });
const schemas = {
  getUserGoals: empty,
  getGoalDetails: goalIdSchema,
  getGoalProgress: goalIdSchema,
  getSubjects: empty,
  getTopics: z.object({ subjectId: z.uuid().nullable() }),
  getStudySchedule: z.object({ days: z.number().int().min(1).max(14) }),
  getStudyHistory: z.object({ days: z.number().int().min(1).max(30) }),
  getUpcomingDeadlines: empty,
  getAssignments: empty,
  getStudyResources: z.object({ resourceId: z.uuid().nullable() }),
  getWeeklyAnalytics: empty,
  proposeGoalPlan: goalPlanSchema,
  proposeGoal: z.object({
    title: z.string().trim().min(1).max(200),
    targetDate: z.iso.date(),
    goalId: z.uuid().nullable(),
  }),
  proposeStudySchedule: z.object({
    goalId: z.uuid(),
    days: z.number().int().min(1).max(14),
  }),
  createGoalTask: z.object({ goalId: z.uuid(), value: taskSchema }),
  updateGoalTask: z.object({
    goalId: z.uuid(),
    taskId: z.uuid(),
    value: taskSchema,
  }),
  rescheduleStudySession: z.object({
    blockId: z.uuid(),
    date: z.iso.date(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  }),
  createReminder: z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(2000),
    scheduledFor: z.iso.datetime(),
  }),
} as const;
export type AvenToolName = keyof typeof schemas;
const writeTools = new Set<AvenToolName>([
  "proposeGoal",
  "proposeGoalPlan",
  "proposeStudySchedule",
  "createGoalTask",
  "updateGoalTask",
  "rescheduleStudySession",
  "createReminder",
]);
export function validateToolInput(name: string, raw: unknown) {
  if (!Object.hasOwn(schemas, name)) throw new GoalError("invalidTool");
  const result = schemas[name as AvenToolName].safeParse(raw);
  if (!result.success) throw new GoalError("invalidToolInput");
  return result.data;
}
function strictSchema(schema: z.ZodType) {
  const value = z.toJSONSchema(schema, { io: "output" });
  const clean = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(clean);
      return;
    }
    const object = node as Record<string, unknown>;
    delete object.$schema;
    delete object.default;
    Object.values(object).forEach(clean);
  };
  clean(value);
  return value;
}
export const avenTools = Object.entries(schemas).map(([name, schema]) => ({
  type: "function",
  name,
  strict: true,
  description: writeTools.has(name as AvenToolName)
    ? `${name}: create a reviewable proposal only. Never execute a change; the user must approve it in the application.`
    : `${name}: retrieve authenticated user's verified Acadence records.`,
  parameters: strictSchema(schema),
}));
export async function executeAvenTool(
  userId: string,
  conversationId: string,
  name: string,
  raw: unknown,
) {
  const args = validateToolInput(name, raw),
    db = getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user || user.status !== "active")
    throw new GoalError("authenticationFailed", 403);
  const timezone = user.timezone,
    today = localDay(Date.now(), timezone);
  const proposal = (value: unknown) =>
    storeProposal(userId, conversationId, value);
  if (name === "getUserGoals") {
    const result = await listGoals(userId);
    return {
      total: result.total,
      goals: result.details.map((d) => ({
        id: d.goal.id,
        title: d.goal.title,
        targetDate: d.goal.targetDate,
        status: d.goal.status,
        progress: d.progress,
      })),
      summary: result.statistics,
    };
  }
  if (name === "getGoalDetails" || name === "getGoalProgress") {
    const detail = await getGoalDetail(
      userId,
      (args as { goalId: string }).goalId,
    );
    return name === "getGoalProgress"
      ? detail.progress
      : {
          goal: detail.goal,
          milestones: detail.milestones,
          tasks: detail.tasks.slice(0, 60),
          progress: detail.progress,
          taskTotal: detail.tasks.length,
          activity: detail.activity.slice(0, 10),
        };
  }
  if (name === "getSubjects") return (await goalReferences(userId)).subjects;
  if (name === "getTopics") {
    const { subjectId } = args as { subjectId: string | null };
    const references = await goalReferences(userId);
    return references.topics
      .filter((t) => !subjectId || t.subjectId === subjectId)
      .slice(0, 100);
  }
  if (name === "getStudySchedule") {
    const { days } = args as { days: number };
    const to = shiftDay(today, days);
    return getOccurrences(
      await getScheduleBlocksInRange(userId, { from: today, to }, timezone),
      today,
      shiftDay(to, -1),
    ).slice(0, 60);
  }
  if (name === "getStudyHistory" || name === "getWeeklyAnalytics") {
    const days =
      name === "getWeeklyAnalytics" ? 7 : (args as { days: number }).days;
    const from = new Date(Date.now() - days * 86400000);
    const [sessions, [summary]] = await Promise.all([
      db
        .select({
          id: s.studySessions.id,
          subjectId: s.studySessions.subjectId,
          topicId: s.studySessions.topicId,
          startedAt: s.studySessions.startedAt,
          endedAt: s.studySessions.endedAt,
          seconds: s.studySessions.durationSeconds,
          source: s.studySessions.source,
        })
        .from(s.studySessions)
        .where(
          and(
            eq(s.studySessions.userId, userId),
            eq(s.studySessions.status, "valid"),
            sql`${s.studySessions.startedAt} >= ${from}`,
          ),
        )
        .orderBy(desc(s.studySessions.startedAt))
        .limit(100),
      db
        .select({
          hours: sql<number>`coalesce(sum(${s.studySessions.durationSeconds}),0)::float / 3600`,
          count: sql<number>`count(*)::int`,
        })
        .from(s.studySessions)
        .where(
          and(
            eq(s.studySessions.userId, userId),
            eq(s.studySessions.status, "valid"),
            sql`${s.studySessions.startedAt} >= ${from}`,
          ),
        ),
    ]);
    return {
      period: { from: from.toISOString(), to: new Date().toISOString() },
      summary,
      sessions,
    };
  }
  if (name === "getUpcomingDeadlines") {
    const references = await goalReferences(userId);
    return {
      subjects: references.subjects.filter(
        (s) => s.targetDate && s.targetDate >= today,
      ),
      topics: references.topics.filter(
        (t) => t.targetDate && t.targetDate >= today,
      ),
      goals: (await listGoals(userId)).details
        .filter((d) => d.goal.targetDate >= today)
        .map((d) => ({
          id: d.goal.id,
          title: d.goal.title,
          date: d.goal.targetDate,
        })),
    };
  }
  if (name === "getAssignments")
    return {
      available: false,
      reason:
        "There is no separate assignments model in Acadence. Use verified goal tasks, subject and topic deadlines instead.",
    };
  if (name === "getStudyResources") {
    const { resourceId } = args as { resourceId: string | null };
    if (!resourceId)
      return {
        resources: (await goalReferences(userId)).resources,
        contentsRead: false,
      };
    const prefs = await getAvenPreferences(userId);
    if (!prefs.ai.allowResourceContent)
      throw new GoalError("resourceConsentRequired", 403);
    const [resource] = await db
      .select()
      .from(s.resources)
      .where(
        and(eq(s.resources.id, resourceId), eq(s.resources.userId, userId)),
      );
    if (!resource) throw new GoalError("recordUnavailable", 404);
    if (resource.type === "note")
      return {
        id: resource.id,
        title: resource.title,
        source: `/resources?search=${encodeURIComponent(resource.title)}`,
        contentsRead: true,
        untrustedContent: resource.textContent?.slice(0, 14000) ?? "",
      };
    if (resource.type === "file" && resource.mimeType === "application/pdf")
      return processPdf(userId, resource);
    if (
      resource.type === "file" &&
      resource.mimeType === "text/plain" &&
      resource.storageKey
    ) {
      const { readObjectContent } = await import("@/lib/storage");
      return {
        id: resource.id,
        title: resource.title,
        contentsRead: true,
        source: `/resources?search=${encodeURIComponent(resource.title)}`,
        untrustedContent: (await readObjectContent(resource.storageKey, 100000))
          .toString("utf8")
          .slice(0, 14000),
      };
    }
    if (resource.type === "link" && resource.url) {
      const value = await readLearningLink(resource.url);
      return {
        id: resource.id,
        title: resource.title,
        source: resource.url,
        contentsRead: value.contentsRead,
        untrustedContent: value.text,
        reason: value.reason,
      };
    }
    return {
      id: resource.id,
      title: resource.title,
      url: resource.url,
      contentsRead: false,
      reason:
        "This resource format was not processed. Do not infer its contents from the title or URL.",
    };
  }
  if (name === "proposeGoal") {
    const value = args as {
      title: string;
      targetDate: string;
      goalId: string | null;
    };
    const existing = value.goalId
      ? await getGoalDetail(userId, value.goalId)
      : null;
    const goal = goalSchema.parse({
      ...existing?.goal,
      title: value.title,
      targetDate: value.targetDate,
      startDate:
        existing?.goal.startDate && existing.goal.startDate <= value.targetDate
          ? existing.goal.startDate
          : value.targetDate < today
            ? value.targetDate
            : today,
      progressMode: existing?.goal.progressMode ?? "outcome",
    });
    const t = await getTranslations({
      locale: (await getAvenPreferences(userId)).ai.locale,
      namespace: "aven",
    });
    return proposal({
      kind: "goalPlan",
      goalId: value.goalId,
      expectedVersion: existing?.goal.version ?? 0,
      explanation: t("simpleGoalExplanation"),
      goal,
      milestones: [],
      tasks: [],
    });
  }
  if (name === "proposeGoalPlan") return proposal(args);
  if (name === "proposeStudySchedule") {
    const { goalId, days } = args as { goalId: string; days: number },
      detail = await getGoalDetail(userId, goalId),
      preferences = await getAvenPreferences(userId),
      to = shiftDay(today, days);
    const commitments = getOccurrences(
      await getScheduleBlocksInRange(userId, { from: today, to }, timezone),
      today,
      to,
    );
    const links = await db
      .select()
      .from(s.goalScheduleLinks)
      .where(eq(s.goalScheduleLinks.goalId, goalId));
    const plannedMinutes: Record<string, number> = {};
    for (const occurrence of commitments) {
      const taskId = links.find(
        (link) => link.blockId === occurrence.block.id,
      )?.taskId;
      if (taskId && Date.parse(occurrence.startsAt) >= Date.now())
        plannedMinutes[taskId] =
          (plannedMinutes[taskId] ?? 0) +
          (Date.parse(occurrence.endsAt) - Date.parse(occurrence.startsAt)) /
            60000;
    }
    const plan = proposeAdaptiveSchedule(
      detail,
      preferences.ai,
      commitments,
      timezone,
      Date.now(),
      days,
      plannedMinutes,
    );
    const t = await getTranslations({
      locale: preferences.ai.locale,
      namespace: "aven",
    });
    return "kind" in plan
      ? proposal({
          ...plan,
          explanation: t("scheduleExplanation", {
            remaining: plan.unscheduledTasks,
          }),
        })
      : {
          availableCapacity: false,
          unscheduledTasks: plan.unscheduled,
          reason:
            "No eligible slots or unblocked tasks. Review dependencies, available hours or the target date.",
        };
  }
  if (name === "createGoalTask" || name === "updateGoalTask") {
    const value = args as {
      goalId: string;
      taskId?: string;
      value: z.infer<typeof taskSchema>;
    };
    const detail = await getGoalDetail(userId, value.goalId);
    if (
      name === "updateGoalTask" &&
      !detail.tasks.some((task) => task.id === value.taskId)
    )
      throw new GoalError("recordUnavailable", 404);
    return proposal({
      kind: name === "createGoalTask" ? "taskCreate" : "taskUpdate",
      goalId: value.goalId,
      expectedVersion: detail.goal.version,
      taskId: value.taskId,
      value: value.value,
    });
  }
  if (name === "rescheduleStudySession") {
    const value = args as {
      blockId: string;
      date: string;
      startsAt: string;
      endsAt: string;
    };
    const block = await getCalendarBlock(userId, value.blockId);
    return proposal({
      kind: "reschedule",
      ...value,
      expectedUpdatedAt: block.updatedAt,
    });
  }
  if (name === "createReminder") return proposal({ kind: "reminder", ...args });
  throw new GoalError("invalidTool");
}
