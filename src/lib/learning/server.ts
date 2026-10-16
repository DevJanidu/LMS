import "server-only";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { localDay, shiftDay } from "@/lib/analytics";
import { getOccurrences, type BlockOccurrence } from "@/lib/schedule";
import { getScheduleBlocksInRange } from "@/lib/services/lists";
import { attendanceList } from "@/lib/study/attendance";
import { attendanceFor } from "@/lib/study/attendance-model";
import { getGoalDetailsBatch, GoalError } from "@/lib/goals/service";
import { normalizeTitle } from "@/lib/aven/decomposition";
import { aiPreferenceSchema, type AiPreferences } from "@/lib/aven/validation";
import { auditTopicCoverage } from "./coverage";
import { evaluateGoalHealth } from "./goal-health";
import { detectLearningGaps } from "./gaps";
import { planPracticeSessions, type PracticeRequest } from "./practice";
import {
  appendSignal,
  removeSignals,
  subjectAttention,
  type LearningSignal,
} from "./signals";
/**
 * Account-scoped loaders for the learning engine. Aven tools, the scheduler and the
 * application routes all call these, so every surface shares one set of rules.
 */
const ACTIVE_GOALS = ["active", "planned", "missedTarget"];
type Db = ReturnType<typeof getDb> | DbTransaction;
async function account(userId: string, db: Db = getDb()) {
  const [row] = await db
    .select({
      timezone: s.users.timezone,
      status: s.users.status,
      preferences: s.aiUserPreferences.value,
    })
    .from(s.users)
    .leftJoin(s.aiUserPreferences, eq(s.aiUserPreferences.userId, s.users.id))
    .where(eq(s.users.id, userId));
  if (!row || row.status !== "active")
    throw new GoalError("authenticationFailed", 403);
  const preferences: AiPreferences = aiPreferenceSchema.parse(
    row.preferences ?? {},
  );
  return { timezone: row.timezone, preferences };
}
export async function resolveOwnedSubject(
  userId: string,
  subjectId: string | null,
  subjectName: string | null,
) {
  const rows = await getDb()
    .select({
      id: s.subjects.id,
      title: s.subjects.title,
      targetDate: s.subjects.targetDate,
    })
    .from(s.subjects)
    .where(
      and(
        eq(s.subjects.userId, userId),
        subjectId ? eq(s.subjects.id, subjectId) : undefined,
      ),
    )
    .limit(1000);
  if (subjectId) {
    if (!rows[0]) throw new GoalError("recordUnavailable", 404);
    return rows[0];
  }
  const wanted = normalizeTitle(subjectName ?? "");
  if (!wanted) throw new GoalError("subjectRequired");
  const exact = rows.find((row) => normalizeTitle(row.title) === wanted);
  const partial = rows.filter((row) => {
    const title = normalizeTitle(row.title);
    return title.includes(wanted) || wanted.includes(title);
  });
  const match = exact ?? (partial.length === 1 ? partial[0] : undefined);
  if (!match) throw new GoalError("subjectNotFound", 404);
  return match;
}
/** Postponements: sessions moved to a later day, and sessions reported as skipped. */
async function postponements(
  userId: string,
  from: string,
  subjectId?: string,
) {
  const subject = subjectId
    ? sql`AND coalesce(e.new_subject_id, b.subject_id) = ${subjectId}::uuid`
    : sql``;
  const attendanceSubject = subjectId
    ? sql`AND b.subject_id = ${subjectId}::uuid`
    : sql``;
  const result = await getDb().execute<{
    topic_id: string | null;
    subject_id: string | null;
    date: string;
    kind: "moved" | "skipped";
  }>(sql`
    SELECT coalesce(e.new_topic_id, b.topic_id) AS topic_id,
      coalesce(e.new_subject_id, b.subject_id) AS subject_id, e.date::text AS date, 'moved' AS kind
    FROM schedule_exceptions e JOIN schedule_blocks b ON b.id = e.block_id
    WHERE b.user_id = ${userId}::uuid AND e.date >= ${from}::date AND NOT e.is_cancelled
      AND e.new_starts_at IS NOT NULL AND (e.new_starts_at AT TIME ZONE b.timezone)::date > e.date ${subject}
    UNION ALL
    SELECT b.topic_id, b.subject_id, a.date::text, 'skipped'
    FROM schedule_attendance a JOIN schedule_blocks b ON b.id = a.block_id AND b.user_id = a.user_id
    WHERE a.user_id = ${userId}::uuid AND a.status = 'skipped' AND a.date >= ${from}::date ${attendanceSubject}
    LIMIT 2000
  `);
  return result.rows.map((row) => ({
    topicId: row.topic_id,
    subjectId: row.subject_id,
    date: row.date,
    kind: row.kind,
  }));
}
export function storedSignals(preferences: AiPreferences): LearningSignal[] {
  return preferences.learningSignals;
}
/** Goal tasks for these topics, with the titles of unfinished prerequisites. */
async function topicGoalTasks(
  userId: string,
  topicIds: string[],
  goalId?: string | null,
) {
  if (!topicIds.length) return { tasks: [], scheduledTopicIds: [] as string[] };
  const db = getDb();
  const linked = await db
    .select({ goalId: s.goalTasks.goalId })
    .from(s.goalTasks)
    .innerJoin(s.goals, eq(s.goals.id, s.goalTasks.goalId))
    .where(
      and(
        eq(s.goals.userId, userId),
        inArray(s.goals.status, ACTIVE_GOALS),
        inArray(s.goalTasks.topicId, topicIds),
        goalId ? eq(s.goals.id, goalId) : undefined,
      ),
    )
    .groupBy(s.goalTasks.goalId)
    .limit(20);
  const details = await getGoalDetailsBatch(
    userId,
    linked.map((row) => row.goalId),
  );
  const tasks = details.flatMap((detail) =>
    detail.tasks
      .filter((task) => task.topicId && topicIds.includes(task.topicId))
      .map((task) => ({
        topicId: task.topicId!,
        taskTitle: task.title,
        goalId: detail.goal.id,
        goalTitle: detail.goal.title,
        blockedBy: detail.progress.blockedIds.includes(task.id)
          ? detail.tasks
              .filter(
                (other) =>
                  (task.dependencyIds.includes(other.id) ||
                    detail.milestones
                      .find((m) => m.id === task.milestoneId)
                      ?.dependencyIds.includes(other.milestoneId ?? "")) &&
                  (detail.progress.taskProgress[other.id] ?? 0) < 100,
              )
              .map((other) => other.title)
              .slice(0, 5)
          : [],
      })),
  );
  const scheduled = await db
    .select({ topicId: s.goalTasks.topicId })
    .from(s.goalScheduleLinks)
    .innerJoin(s.goalTasks, eq(s.goalTasks.id, s.goalScheduleLinks.taskId))
    .innerJoin(s.goals, eq(s.goals.id, s.goalScheduleLinks.goalId))
    .where(and(eq(s.goals.userId, userId), inArray(s.goalTasks.topicId, topicIds)))
    .limit(2000);
  return {
    tasks,
    scheduledTopicIds: scheduled
      .map((row) => row.topicId)
      .filter((id): id is string => Boolean(id)),
  };
}
export async function loadTopicCoverage(
  userId: string,
  subjectId: string,
  options: { goalId?: string | null; from?: string | null; to?: string | null } = {},
) {
  const db = getDb(),
    now = Date.now();
  const [{ timezone, preferences }, subject] = await Promise.all([
    account(userId),
    resolveOwnedSubject(userId, subjectId, null),
  ]);
  const today = localDay(now, timezone);
  const from = options.from ?? shiftDay(today, -60),
    to = options.to ?? shiftDay(today, 28);
  if (to < from || Date.parse(to) - Date.parse(from) > 366 * 86400000)
    throw new GoalError("invalidInput");
  const [topics, studies, blocks, moved] = await Promise.all([
    db
      .select({
        id: s.topics.id,
        title: s.topics.title,
        status: s.topics.status,
        targetDate: s.topics.targetDate,
        completedAt: s.topics.completedAt,
        sortOrder: s.topics.sortOrder,
      })
      .from(s.topics)
      .where(and(eq(s.topics.subjectId, subject.id), eq(s.topics.archived, false)))
      .limit(500),
    // All-time verified study per topic; the subject index bounds the scan.
    db
      .select({
        topicId: s.studySessions.topicId,
        seconds: sql<number>`coalesce(sum(${s.studySessions.durationSeconds}),0)::int`,
        startedAt: sql<string>`max(${s.studySessions.startedAt})::text`,
      })
      .from(s.studySessions)
      .where(
        and(
          eq(s.studySessions.userId, userId),
          eq(s.studySessions.subjectId, subject.id),
          eq(s.studySessions.status, "valid"),
        ),
      )
      .groupBy(s.studySessions.topicId),
    getScheduleBlocksInRange(userId, { from, to: shiftDay(to, 1) }, timezone),
    postponements(userId, from, subject.id),
  ]);
  const topicIds = topics.map((topic) => topic.id);
  const goalTasks = await topicGoalTasks(userId, topicIds, options.goalId);
  const occurrences = getOccurrences(blocks, from, to).filter(
    (item) => item.block.subjectId === subject.id,
  );
  const attention = subjectAttention(storedSignals(preferences), subject.id, {
    now,
    completedAt: topics.map((topic) => topic.completedAt?.toISOString() ?? null),
  });
  const audit = auditTopicCoverage({
    subject,
    topics: topics.map((topic) => ({
      ...topic,
      completedAt: topic.completedAt?.toISOString() ?? null,
    })),
    occurrences: occurrences.map((item) => ({
      topicId: item.block.topicId ?? null,
      date: item.date,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
    })),
    postponements: moved.map((item) => ({
      topicId: item.topicId,
      date: item.date,
      kind: item.kind,
    })),
    studies: studies.map((row) => ({
      topicId: row.topicId,
      startedAt: row.startedAt,
      seconds: row.seconds,
    })),
    goalTasks: options.goalId
      ? goalTasks.tasks.filter((task) => task.goalId === options.goalId)
      : goalTasks.tasks,
    goalScheduledTopicIds: goalTasks.scheduledTopicIds,
    confidence: attention.topics,
    today,
    now,
  });
  return {
    audit,
    attention,
    window: { from, to },
    timezone,
    preferences,
    occurrences,
  };
}
export async function loadGoalHealth(userId: string, goalId?: string | null) {
  const { timezone, preferences } = await account(userId);
  const goals = await getDb()
    .select({ id: s.goals.id })
    .from(s.goals)
    .where(
      and(
        eq(s.goals.userId, userId),
        goalId ? eq(s.goals.id, goalId) : inArray(s.goals.status, ACTIVE_GOALS),
      ),
    )
    .orderBy(s.goals.targetDate)
    .limit(20);
  if (goalId && !goals.length) throw new GoalError("recordUnavailable", 404);
  const details = await getGoalDetailsBatch(
    userId,
    goals.map((goal) => goal.id),
  );
  const now = Date.now(),
    today = localDay(now, timezone);
  return {
    details,
    healths: details.map((detail) =>
      evaluateGoalHealth(detail, {
        today,
        now,
        dailyTargetMinutes: preferences.dailyTargetMinutes,
        studyDays: preferences.studyDays,
      }),
    ),
  };
}
function missedOccurrences(
  occurrences: BlockOccurrence[],
  attendance: Awaited<ReturnType<typeof attendanceList>>,
  studies: { subjectId: string; startedAt: Date }[],
  now: number,
) {
  return occurrences.filter((item) => {
    if (!item.block.subjectId || Date.parse(item.endsAt) > now) return false;
    if (attendanceFor(item, attendance)) return false;
    const start = Date.parse(item.startsAt),
      end = Date.parse(item.endsAt);
    return !studies.some(
      (study) =>
        study.subjectId === item.block.subjectId &&
        study.startedAt.getTime() >= start - 15 * 60000 &&
        study.startedAt.getTime() < end,
    );
  });
}
/** Layer A monitoring: deterministic findings for one learner, bounded queries only. */
export async function loadLearningGaps(userId: string, now = Date.now()) {
  const db = getDb();
  const [{ timezone, preferences }, { details, healths }] = await Promise.all([
    account(userId),
    loadGoalHealth(userId),
  ]);
  const today = localDay(now, timezone);
  const weekAgo = new Date(now - 7 * 86400000);
  const [subjects, studies, moved, blocks, attendance] = await Promise.all([
    db
      .select({ id: s.subjects.id, title: s.subjects.title })
      .from(s.subjects)
      .where(and(eq(s.subjects.userId, userId), eq(s.subjects.status, "active")))
      .limit(1000),
    db
      .select({
        subjectId: s.studySessions.subjectId,
        startedAt: s.studySessions.startedAt,
        seconds: s.studySessions.durationSeconds,
      })
      .from(s.studySessions)
      .where(
        and(
          eq(s.studySessions.userId, userId),
          eq(s.studySessions.status, "valid"),
          gte(s.studySessions.startedAt, new Date(now - 8 * 86400000)),
        ),
      )
      .limit(2000),
    postponements(userId, shiftDay(today, -30)),
    getScheduleBlocksInRange(
      userId,
      { from: shiftDay(today, -7), to: shiftDay(today, 8) },
      timezone,
    ),
    attendanceList(userId),
  ]);
  const occurrences = getOccurrences(blocks, shiftDay(today, -7), shiftDay(today, 7));
  const missed = missedOccurrences(
    occurrences.filter((item) => Date.parse(item.startsAt) >= weekAgo.getTime()),
    attendance,
    studies,
    now,
  ).map((item) => ({ subjectId: item.block.subjectId!, date: item.date }));
  const studyMinutesBySubject: Record<string, number> = {};
  for (const study of studies)
    if (study.startedAt >= weekAgo)
      studyMinutesBySubject[study.subjectId] =
        (studyMinutesBySubject[study.subjectId] ?? 0) + study.seconds / 60;
  const topicCounts = new Map<string, number>();
  for (const item of moved)
    if (item.topicId)
      topicCounts.set(item.topicId, (topicCounts.get(item.topicId) ?? 0) + 1);
  const postponedIds = [...topicCounts]
    .filter(([, count]) => count >= 2)
    .map(([id]) => id);
  const signals = storedSignals(preferences);
  const signalSubjects = [...new Set(signals.map((item) => item.subjectId))].filter(
    (id) => subjects.some((subject) => subject.id === id),
  );
  const topicRows = postponedIds.length || signalSubjects.length
    ? await db
        .select({
          id: s.topics.id,
          title: s.topics.title,
          subjectId: s.topics.subjectId,
          status: s.topics.status,
          completedAt: s.topics.completedAt,
        })
        .from(s.topics)
        .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
        .where(
          and(
            eq(s.subjects.userId, userId),
            eq(s.topics.archived, false),
            or(
              postponedIds.length ? inArray(s.topics.id, postponedIds) : undefined,
              signalSubjects.length
                ? inArray(s.topics.subjectId, signalSubjects)
                : undefined,
            ),
          ),
        )
        .limit(2000)
    : [];
  const attention = signalSubjects.flatMap((subjectId) => {
    const topics = topicRows.filter((topic) => topic.subjectId === subjectId);
    const value = subjectAttention(signals, subjectId, {
      now,
      completedAt: topics.map((topic) => topic.completedAt?.toISOString() ?? null),
    });
    if (!value.level || !value.reportedAt) return [];
    return [
      {
        subjectId,
        level: value.level,
        reportedAt: value.reportedAt,
        openTopics: topics.filter((topic) => topic.status !== "completed").length,
        upcomingSessions: occurrences.filter(
          (item) =>
            item.block.subjectId === subjectId &&
            Date.parse(item.startsAt) > now,
        ).length,
      },
    ];
  });
  const findings = detectLearningGaps({
    today,
    healths,
    details,
    subjects,
    postponedTopics: postponedIds.flatMap((id) => {
      const topic = topicRows.find((row) => row.id === id);
      return topic && topic.status !== "completed"
        ? [
            {
              topicId: id,
              topic: topic.title,
              subjectId: topic.subjectId,
              count: topicCounts.get(id)!,
            },
          ]
        : [];
    }),
    missed,
    studyMinutesBySubject,
    attention,
  });
  return { findings, healths, timezone, preferences, today };
}
/** Builds practice sessions for a subject; the caller turns them into a reviewable proposal. */
export async function planSubjectPractice(
  userId: string,
  subjectId: string,
  request: PracticeRequest,
) {
  const coverage = await loadTopicCoverage(userId, subjectId);
  const now = Date.now(),
    today = localDay(now, coverage.timezone),
    horizon = shiftDay(today, Math.min(14, request.horizonDays));
  // Every commitment in the horizon, not only this subject, so nothing overlaps.
  const commitments = getOccurrences(
    await getScheduleBlocksInRange(
      userId,
      { from: today, to: shiftDay(horizon, 1) },
      coverage.timezone,
    ),
    today,
    horizon,
  ).map((item) => ({
    blockId: item.block.id,
    date: item.date,
    title: item.title,
    subjectId: item.block.subjectId ?? null,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
  }));
  const plan = planPracticeSessions({
    audit: coverage.audit,
    attention: coverage.attention,
    preferences: coverage.preferences,
    commitments,
    timezone: coverage.timezone,
    now,
    request,
  });
  return { ...coverage, plan };
}
/** Difficulty and postponement facts the Next Best Action ranking weighs in. */
export async function learningRankingContext(
  userId: string,
  signals: LearningSignal[],
  timezone: string,
) {
  const now = Date.now();
  const subjectIds = [...new Set(signals.map((item) => item.subjectId))];
  const [moved, topics] = await Promise.all([
    postponements(userId, shiftDay(localDay(now, timezone), -30)),
    subjectIds.length
      ? getDb()
          .select({
            subjectId: s.topics.subjectId,
            completedAt: s.topics.completedAt,
          })
          .from(s.topics)
          .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
          .where(
            and(
              eq(s.subjects.userId, userId),
              inArray(s.topics.subjectId, subjectIds),
            ),
          )
          .limit(2000)
      : [],
  ]);
  const difficulty: Record<string, "needsPractice" | "gettingThere"> = {};
  for (const subjectId of subjectIds) {
    const { level } = subjectAttention(signals, subjectId, {
      now,
      completedAt: topics
        .filter((topic) => topic.subjectId === subjectId)
        .map((topic) => topic.completedAt?.toISOString() ?? null),
    });
    if (level === "needsPractice" || level === "gettingThere")
      difficulty[subjectId] = level;
  }
  const postponedTopics: Record<string, number> = {};
  for (const item of moved)
    if (item.topicId)
      postponedTopics[item.topicId] = (postponedTopics[item.topicId] ?? 0) + 1;
  return { difficulty, postponedTopics };
}
export const practiceRecommendationKey = (subjectId: string) =>
  `practice:${subjectId}`;
/** A recommendation the learner rejected stays quiet for this many days unless they ask again. */
export const DECLINE_QUIET_DAYS = 14;
export async function recentlyDeclined(userId: string, key: string) {
  const result = await getDb().execute<{ declined: boolean }>(sql`
    SELECT EXISTS(
      SELECT 1 FROM ai_plan_proposals
      WHERE user_id = ${userId}::uuid AND status = 'rejected'
        AND value->>'recommendationKey' = ${key}
        AND resolved_at > now() - make_interval(days => ${DECLINE_QUIET_DAYS})
    ) AS declined
  `);
  return Boolean(result.rows[0]?.declined);
}
/** Validates ownership, then stores the report inside the account's AI preferences row. */
export async function saveLearningSignal(
  tx: DbTransaction,
  userId: string,
  signal: Omit<LearningSignal, "at"> | { clear: true; subjectId: string; topicId?: string | null },
) {
  const [subject] = await tx
    .select({ id: s.subjects.id })
    .from(s.subjects)
    .where(and(eq(s.subjects.id, signal.subjectId), eq(s.subjects.userId, userId)));
  if (!subject) throw new GoalError("recordUnavailable", 404);
  if (signal.topicId) {
    const [topic] = await tx
      .select({ id: s.topics.id })
      .from(s.topics)
      .where(and(eq(s.topics.id, signal.topicId), eq(s.topics.subjectId, signal.subjectId)));
    if (!topic) throw new GoalError("recordUnavailable", 404);
  }
  const [current] = await tx
    .select()
    .from(s.aiUserPreferences)
    .where(eq(s.aiUserPreferences.userId, userId))
    .for("update");
  const value = aiPreferenceSchema.parse(current?.value ?? {});
  const learningSignals =
    "clear" in signal
      ? removeSignals(value.learningSignals, signal.subjectId, signal.topicId)
      : appendSignal(value.learningSignals, {
          ...signal,
          topicId: signal.topicId ?? null,
          at: new Date().toISOString(),
        });
  const next = { ...value, learningSignals };
  await tx
    .insert(s.aiUserPreferences)
    .values({ userId, value: next })
    .onConflictDoUpdate({
      target: s.aiUserPreferences.userId,
      set: { value: next, updatedAt: new Date() },
    });
  return learningSignals;
}
