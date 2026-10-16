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
import { attendanceList } from "@/lib/study/attendance";
import { attendanceFor, attendanceStatus } from "@/lib/study/attendance-model";
import { getOccurrences } from "@/lib/schedule";
import { localDay, shiftDay, wallTime } from "@/lib/analytics";
import {
  taskSchema,
  goalSchema,
  milestoneSchema,
} from "@/lib/goals/validation";
import { goalPlanSchema } from "./validation";
import { getAvenPreferences } from "./preferences";
import { proposeAdaptiveSchedule } from "./planning";
import { calendarOccurrences } from "@/lib/calendar/model";
import {
  moveSessionsProposal,
  studyScheduleProposal,
} from "./calendar-actions";
import {
  buildGoalHierarchy,
  findDuplicateGoals,
  goalHierarchyInputSchema,
  type GoalHierarchyInput,
} from "./decomposition";
import { getNextBestActions } from "@/lib/goals/next-action-server";
import { resourceVersion } from "./extra-proposals";
import { proposalSchema } from "./validation";
import { storeProposal } from "./proposals";
import { readLearningLink } from "./resource-network";
import { processPdf } from "./documents";
import { learnerAnalytics } from "@/lib/analytics/server";
import { studyCirclesSnapshot } from "@/lib/circles/assistant";
const empty = z.object({}),
  goalIdSchema = z.object({ goalId: z.uuid() });
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T[0-2]\d:[0-5]\d$/);
const schemas = {
  getUserProfile: empty,
  getStudyCircles: empty,
  getNotificationPreferences: empty,
  getCalendar: z.object({ from: z.iso.date(), to: z.iso.date() }),
  moveStudySessions: z.object({
    sessions: z
      .array(
        z.object({
          blockId: z.uuid(),
          date: z.iso
            .date()
            .describe(
              "Original occurrence date from getCalendar.sessions[].date or notification action.date, not the destination date.",
            ),
          localStartsAt: localTime.describe(
            "Destination date and time in the account timezone, YYYY-MM-DDTHH:mm.",
          ),
          scope: z
            .enum(["one", "future", "all"])
            .describe(
              "Recurring sessions only: 'one' for this occurrence (default choice), 'future' for this and later occurrences, 'all' for the whole series. Use future/all only when the student explicitly asked.",
            ),
        }),
      )
      .min(1)
      .max(30),
    explanation: z.string().min(1).max(4000),
  }),
  cancelStudySessions: z.object({
    sessions: z
      .array(
        z.object({
          blockId: z.uuid(),
          date: z.iso.date(),
          scope: z.enum(["one", "future", "all"]),
        }),
      )
      .min(1)
      .max(30),
    explanation: z.string().min(1).max(4000),
  }),
  createStudySchedule: z.object({
    title: z.string().min(1).max(150),
    subjectId: z.uuid().nullable(),
    subjectName: z
      .string()
      .max(150)
      .nullable()
      .describe(
        "Subject named by the student; matched to an existing subject.",
      ),
    topicId: z.uuid().nullable(),
    localStartsAt: localTime.describe(
      "First session start in account local time, YYYY-MM-DDTHH:mm.",
    ),
    durationMinutes: z.number().int().min(15).max(240),
    repeat: z
      .enum(["once", "daily", "weekly"])
      .describe("daily repeats every day; weekly repeats on weekdays."),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .describe("0=Sunday. Required for weekly; ignored otherwise."),
    until: z.iso
      .date()
      .nullable()
      .describe("Last date (inclusive) for a repeating schedule."),
    skipConflicts: z
      .boolean()
      .describe(
        "Skip conflicting dates. Only true after the student agreed to skip them.",
      ),
    explanation: z.string().min(1).max(4000),
  }),
  proposeGoalHierarchy: goalHierarchyInputSchema,
  getNextBestAction: z.object({
    goalId: z.uuid().nullable(),
    limit: z.number().int().min(1).max(5),
  }),
  completeGoal: z.object({
    goalId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    completed: z.boolean(),
  }),
  createGoalMilestone: z.object({
    goalId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    title: z.string().min(1).max(200),
    description: z.string().max(4000),
    dueDate: z.iso.date().nullable(),
  }),
  updateStudyPreferences: proposalSchema.options.find(
    (option) => option.shape.kind.value === "studyPreferences",
  )!,
  updateReminderPreferences: proposalSchema.options.find(
    (option) => option.shape.kind.value === "reminderPreferences",
  )!,
  organizeLearningResource: z.object({
    resourceId: z.uuid(),
    subjectId: z.uuid(),
    topicId: z.uuid().nullable(),
    title: z.string().max(150).nullable(),
    explanation: z.string().max(4000),
  }),
  rememberPreference: z.object({ content: z.string().min(1).max(2000) }),
  getUserGoals: z.object({
    page: z.number().int().min(1).max(100000).default(1),
    search: z.string().max(100).nullable().default(null),
  }),
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
    expectedVersion: z.number().int().positive(),
    taskId: z.uuid(),
    value: taskSchema,
  }),
  rescheduleStudySession: z.object({
    blockId: z.uuid(),
    date: z.iso
      .date()
      .describe("Original occurrence date, not the destination date."),
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
  "moveStudySessions",
  "cancelStudySessions",
  "createStudySchedule",
  "completeGoal",
  "createGoalMilestone",
  "updateStudyPreferences",
  "updateReminderPreferences",
  "organizeLearningResource",
  "rememberPreference",
  "proposeGoal",
  "proposeGoalPlan",
  "proposeGoalHierarchy",
  "proposeStudySchedule",
  "createGoalTask",
  "updateGoalTask",
  "rescheduleStudySession",
  "createReminder",
]);
export const isAvenWriteTool = (name: string) =>
  writeTools.has(name as AvenToolName);
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
    : name === "getCalendar"
      ? "Read the user's actual study sessions in account local time. from is inclusive, to is exclusive, both YYYY-MM-DD. For one day use from=day and to=next day; equal dates also mean that single day. Use this for tomorrow's schedule before proposing a move."
      : name === "getUserGoals"
        ? "Read owned goals with progress. page starts at 1; search filters titles. Follow hasMore with the next page rather than assuming the first page is the whole account."
        : name === "getStudyCircles"
          ? "Read the student's Study Circles standing: this week's verified timer time, rank and gap to the next place among friends, the same for each of their study groups, last week's total and the scoring rules. Only data the student can already see in Study Circles."
        : name === "getNextBestAction"
          ? "Rank the most useful next tasks across active goals (or one goal) from deadlines, priority, dependencies, progress, recent activity and the daily target. Reasons are verified; explain them without reordering."
          : `${name}: retrieve authenticated user's verified Acadence records.`,
  parameters: strictSchema(schema),
}));
export async function executeAvenTool(
  userId: string,
  conversationId: string,
  name: string,
  raw: unknown,
) {
  try {
    const result = await performAvenTool(userId, conversationId, name, raw);
    await getDb()
      .insert(s.auditLogs)
      .values({
        actorUserId: userId,
        action: "aven.tool",
        targetType: "aiConversation",
        targetId: conversationId,
        metadata: {
          tool: name,
          outcome: "success",
          proposedWrite: writeTools.has(name as AvenToolName),
        },
      });
    return result;
  } catch (error) {
    const code = error instanceof GoalError ? error.message : "toolUnavailable";
    await getDb()
      .insert(s.auditLogs)
      .values({
        actorUserId: userId,
        action: "aven.tool",
        targetType: "aiConversation",
        targetId: conversationId,
        metadata: {
          tool: Object.hasOwn(schemas, name) ? name : "unknown",
          outcome: "error",
          code,
        },
      })
      .catch(() => {});
    console.warn(
      JSON.stringify({
        event: "aven_tool_failed",
        tool: Object.hasOwn(schemas, name) ? name : "unknown",
        code,
        category: error instanceof Error ? error.name : "unknown",
      }),
    );
    throw error;
  }
}
async function performAvenTool(
  userId: string,
  conversationId: string,
  name: string,
  raw: unknown,
) {
  const args = validateToolInput(name, raw),
    db = getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user || user.status !== "active" || user.role !== "learner")
    throw new GoalError("authenticationFailed", 403);
  const timezone = user.timezone,
    today = localDay(Date.now(), timezone);
  const proposal = (value: unknown) =>
    storeProposal(userId, conversationId, value);

  if (name === "getStudyCircles") return studyCirclesSnapshot(userId);
  if (name === "getUserProfile") {
    const [[prefs], [timer]] = await Promise.all([
      db.select().from(s.preferences).where(eq(s.preferences.userId, userId)),
      db.select().from(s.activeTimers).where(eq(s.activeTimers.userId, userId)),
    ]);
    const [setting] = await db
      .select()
      .from(s.appSettings)
      .where(eq(s.appSettings.key, "streakMinutes"));
    const analytics = await learnerAnalytics(
      userId,
      timezone,
      prefs?.weekStartDay === 0 ? 0 : 1,
      Number(setting?.value ?? 10),
      undefined,
      prefs?.highestStreak ?? 0,
    );
    return {
      name: user.name,
      timezone,
      today,
      weekStartDay: prefs?.weekStartDay ?? 1,
      weeklyTargetMinutes: prefs?.weeklyTargetMinutes ?? 0,
      verifiedProgress: {
        currentStreak: analytics.currentStreak,
        longestStreak: analytics.longestStreak,
        todayMinutes: Math.round(analytics.todaySeconds / 60),
        weekMinutes: Math.round(analytics.weekSeconds / 60),
        loggedSessions: analytics.sessionCount,
      },
      coaching: (await getAvenPreferences(userId)).ai,
      activeTimer: timer
        ? {
            subjectId: timer.subjectId,
            startedAt: timer.startedAt,
            paused: Boolean(timer.pausedAt),
            note: "A timer is not proof of focused study.",
          }
        : null,
    };
  }
  if (name === "getNotificationPreferences")
    return (await getAvenPreferences(userId)).notifications;
  if (name === "getCalendar") {
    const attendance = await attendanceList(userId);
    const { from, to: requestedTo } = args as { from: string; to: string };
    const to = requestedTo === from ? shiftDay(from, 1) : requestedTo;
    if (to < from || Date.parse(to) - Date.parse(from) > 366 * 86400000)
      throw new GoalError("invalidInput");
    const sessions = calendarOccurrences(
      await getScheduleBlocksInRange(userId, { from, to }, timezone),
      { from, to },
      timezone,
    );
    return {
      timezone,
      from,
      to,
      total: sessions.length,
      truncated: sessions.length > 100,
      sessions: sessions.slice(0, 100).map((item) => ({
        ...item,
        blockId: item.block.id,
        localStartsAt: wallTime(item.startsAt, timezone),
        localEndsAt: wallTime(item.endsAt, timezone),
        attendance: attendanceFor(item, attendance) ?? null,
        attendanceStatus: attendanceStatus(item, attendance, Date.now()),
      })),
    };
  }
  if (name === "moveStudySessions") {
    const value = args as {
      sessions: {
        blockId: string;
        date: string;
        localStartsAt: string;
        scope: "one" | "future" | "all";
      }[];
      explanation: string;
    };
    return proposal(
      await moveSessionsProposal(
        userId,
        timezone,
        value.sessions,
        value.explanation,
      ),
    );
  }
  if (name === "cancelStudySessions") {
    const value = args as {
      sessions: {
        blockId: string;
        date: string;
        scope: "one" | "future" | "all";
      }[];
      explanation: string;
    };
    const changes = [];
    for (const item of value.sessions) {
      const block = await getCalendarBlock(userId, item.blockId);
      changes.push({
        ...item,
        action: "cancel" as const,
        expectedUpdatedAt: block.updatedAt,
      });
    }
    return proposal({
      kind: "calendarChanges",
      explanation: value.explanation,
      changes,
    });
  }
  if (name === "createStudySchedule") {
    const planned = await studyScheduleProposal(
      userId,
      timezone,
      args as Parameters<typeof studyScheduleProposal>[2],
    );
    if (!planned.ready) return planned.result;
    return proposal(planned.value);
  }
  if (name === "proposeGoalHierarchy") {
    const value = args as GoalHierarchyInput;
    const [existingGoals, references, preferences, [recent]] =
      await Promise.all([
        db
          .select({
            id: s.goals.id,
            title: s.goals.title,
            status: s.goals.status,
            targetDate: s.goals.targetDate,
            version: s.goals.version,
          })
          .from(s.goals)
          .where(eq(s.goals.userId, userId))
          .limit(500),
        goalReferences(userId),
        getAvenPreferences(userId),
        db
          .select({
            seconds: sql<number>`coalesce(sum(${s.studySessions.durationSeconds}),0)::int`,
          })
          .from(s.studySessions)
          .where(
            and(
              eq(s.studySessions.userId, userId),
              eq(s.studySessions.status, "valid"),
              sql`${s.studySessions.startedAt} >= now() - interval '28 days'`,
            ),
          ),
      ]);
    const target = value.goalId
      ? existingGoals.find((goal) => goal.id === value.goalId)
      : undefined;
    if (value.goalId && !target) throw new GoalError("recordUnavailable", 404);
    // Never propose a second copy of an existing goal unless the student asked for one.
    const duplicates = value.goalId
      ? []
      : findDuplicateGoals(value.title, existingGoals);
    if (duplicates.length && !value.allowDuplicate)
      return {
        proposalCreated: false,
        duplicates: duplicates.slice(0, 5).map((goal) => ({
          id: goal.id,
          title: goal.title,
          status: goal.status,
          targetDate: goal.targetDate,
        })),
        next: "Tell the student a similar goal exists. Offer to extend it (call again with its goalId) or, only if they confirm, create a separate goal with allowDuplicate=true.",
      };
    const t = await getTranslations({
      locale: preferences.ai.locale,
      namespace: "aven.decomposition",
    });
    let built: ReturnType<typeof buildGoalHierarchy>;
    try {
      built = buildGoalHierarchy(value, {
        today,
        subjects: references.subjects,
        dailyTargetMinutes: preferences.ai.dailyTargetMinutes,
        studyDays: preferences.ai.studyDays,
        recentWeeklyMinutes: Math.round((recent?.seconds ?? 0) / 60 / 4),
        expectedVersion: target?.version ?? 0,
        translate: (key, values) => t(key, values),
      });
    } catch (error) {
      throw new GoalError((error as Error).message);
    }
    return { ...(await proposal(built.proposal)), summary: built.summary };
  }
  if (name === "getNextBestAction") {
    const { goalId, limit } = args as { goalId: string | null; limit: number };
    const actions = await getNextBestActions(userId, { goalId, limit });
    return {
      actions,
      ranking:
        "Deterministic: overdue or due soon, goal and task priority, tasks it unblocks, work already started, recent activity, at-risk goals and fit with the daily target.",
      ...(actions.length
        ? {}
        : {
            empty:
              "No unblocked open tasks in active goals. Suggest adding tasks or a goal.",
          }),
    };
  }
  if (name === "completeGoal" || name === "createGoalMilestone") {
    const value = args as {
      goalId: string;
      expectedVersion: number;
      completed: boolean;
      title: string;
      description: string;
      dueDate: string | null;
    };
    const detail = await getGoalDetail(userId, value.goalId);
    if (detail.goal.version !== value.expectedVersion)
      throw new GoalError("conflict", 409);
    return proposal(
      name === "completeGoal"
        ? {
            kind: "goalCompletion",
            goalId: value.goalId,
            expectedVersion: value.expectedVersion,
            completed: value.completed,
            title: detail.goal.title,
          }
        : {
            kind: "milestoneCreate",
            goalId: value.goalId,
            expectedVersion: value.expectedVersion,
            value: milestoneSchema.parse({
              title: value.title,
              description: value.description,
              dueDate: value.dueDate,
              order: detail.milestones.length,
            }),
          },
    );
  }
  if (name === "updateStudyPreferences" || name === "updateReminderPreferences")
    return proposal(args);
  if (name === "organizeLearningResource") {
    const value = args as {
      resourceId: string;
      subjectId: string;
      topicId: string | null;
      title: string | null;
      explanation: string;
    };
    const [resource] = await db
      .select()
      .from(s.resources)
      .where(
        and(
          eq(s.resources.id, value.resourceId),
          eq(s.resources.userId, userId),
        ),
      );
    if (!resource) throw new GoalError("recordUnavailable", 404);
    return proposal({
      ...value,
      kind: "resourceOrganization",
      expectedHash: resourceVersion(resource),
    });
  }
  if (name === "rememberPreference")
    return proposal({ kind: "memory", ...(args as { content: string }) });
  if (name === "getUserGoals") {
    const { page, search } = args as { page: number; search: string | null };
    const result = await listGoals(userId, page, search ?? "");
    return {
      total: result.total,
      page: result.page,
      hasMore: result.page < Math.ceil(result.total / 20),
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
    const attendance = await attendanceList(userId);
    const { days } = args as { days: number };
    const to = shiftDay(today, days);
    const sessions = calendarOccurrences(
      await getScheduleBlocksInRange(userId, { from: today, to }, timezone),
      { from: today, to },
      timezone,
    );
    return {
      timezone,
      total: sessions.length,
      truncated: sessions.length > 60,
      sessions: sessions.slice(0, 60).map((item) => ({
        ...item,
        blockId: item.block.id,
        localStartsAt: wallTime(item.startsAt, timezone),
        localEndsAt: wallTime(item.endsAt, timezone),
        attendance: attendanceFor(item, attendance) ?? null,
        attendanceStatus: attendanceStatus(item, attendance, Date.now()),
      })),
    };
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
    // A verified baseline for encouragement; comparisons are only meaningful when it has records.
    const [previousWeek] =
      name === "getWeeklyAnalytics"
        ? await db
            .select({
              hours: sql<number>`coalesce(sum(${s.studySessions.durationSeconds}),0)::float / 3600`,
              count: sql<number>`count(*)::int`,
            })
            .from(s.studySessions)
            .where(
              and(
                eq(s.studySessions.userId, userId),
                eq(s.studySessions.status, "valid"),
                sql`${s.studySessions.startedAt} >= ${new Date(from.getTime() - 7 * 86400000)} AND ${s.studySessions.startedAt} < ${from}`,
              ),
            )
        : [];
    return {
      period: { from: from.toISOString(), to: new Date().toISOString() },
      summary,
      ...(previousWeek
        ? {
            previousWeek: {
              ...previousWeek,
              comparable: previousWeek.count > 0,
            },
          }
        : {}),
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
      goals: await db
        .select({
          id: s.goals.id,
          title: s.goals.title,
          date: s.goals.targetDate,
        })
        .from(s.goals)
        .where(
          and(
            eq(s.goals.userId, userId),
            sql`${s.goals.targetDate} >= ${today}`,
            sql`${s.goals.status} NOT IN ('completed','cancelled')`,
          ),
        )
        .orderBy(s.goals.targetDate)
        .limit(500),
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
      expectedVersion?: number;
      value: z.infer<typeof taskSchema>;
    };
    const detail = await getGoalDetail(userId, value.goalId);
    if (
      name === "updateGoalTask" &&
      detail.goal.version !== value.expectedVersion
    )
      throw new GoalError("conflict", 409);
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
      date:
        block.repeat === "once"
          ? localDay(block.startsAt, block.timezone)
          : value.date,
      expectedUpdatedAt: block.updatedAt,
    });
  }
  if (name === "createReminder") return proposal({ kind: "reminder", ...args });
  throw new GoalError("invalidTool");
}
