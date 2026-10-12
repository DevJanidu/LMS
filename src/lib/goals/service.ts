import "server-only";
import { and, asc, desc, eq, inArray, sql, getTableColumns } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { localDay } from "@/lib/analytics";
import { getGoalCalendar } from "@/lib/services/calendar";
import {
  assertAcyclic,
  hierarchyDependencies,
  calculateGoalProgress,
  type GoalDetail,
  type GoalRecord,
  type GoalTask,
} from "./model";
import {
  goalSchema,
  taskSchema,
  milestoneSchema,
  goalMutationSchema,
  type GoalMutation,
} from "./validation";

export class GoalError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Db = ReturnType<typeof getDb> | DbTransaction;
interface GoalBatch {
  goals: (typeof s.goals.$inferSelect)[];
  tasks: (typeof s.goalTasks.$inferSelect)[];
  milestones: (typeof s.goalMilestones.$inferSelect)[];
  dependencies: (typeof s.goalTaskDependencies.$inferSelect)[];
  links: (typeof s.goalLinks.$inferSelect)[];
  activity: (typeof s.goalActivity.$inferSelect)[];
  sessions: {
    goalId: string;
    id: string;
    sessionId: string;
    taskId: string | null;
    allocatedSeconds: number;
    startedAt: Date;
    subjectId: string;
    title: string;
  }[];
  history: (typeof s.goalHistory.$inferSelect)[];
  snapshots: (typeof s.goalProgressSnapshots.$inferSelect)[];
  user: { timezone: string };
  topics: { id: string; status: string }[];
  calendar: {
    goalId: string;
    blockId: string;
    taskId: string | null;
    title: string;
    startsAt: Date;
    endsAt: Date;
  }[];
}
const ownedGoal = (userId: string, goalId: string) =>
  and(eq(s.goals.id, goalId), eq(s.goals.userId, userId));
const verifiedAllocation = sql<number>`least(${s.goalStudySessionLinks.allocatedSeconds}, floor(${s.studySessions.durationSeconds}::float * ${s.goalStudySessionLinks.allocatedSeconds} / greatest(${s.studySessions.durationSeconds}, (SELECT sum(other.allocated_seconds) FROM goal_study_session_links other WHERE other.session_id=${s.studySessions.id}))))::int`;
export async function getGoalDetail(
  userId: string,
  goalId: string,
  db: Db = getDb(),
  batch?: GoalBatch,
): Promise<GoalDetail> {
  const [row] = batch
    ? batch.goals.filter((g) => g.id === goalId)
    : await db.select().from(s.goals).where(ownedGoal(userId, goalId));
  if (!row) throw new GoalError("recordUnavailable", 404);
  const [
    taskRows,
    milestoneRows,
    dependencies,
    links,
    activity,
    sessions,
    history,
    snapshots,
    [user],
  ] = batch
    ? [
        batch.tasks.filter((t) => t.goalId === goalId),
        batch.milestones.filter((m) => m.goalId === goalId),
        batch.dependencies.filter((d) => d.goalId === goalId),
        batch.links.filter((l) => l.goalId === goalId),
        batch.activity.filter((a) => a.goalId === goalId),
        batch.sessions.filter((l) => l.goalId === goalId),
        batch.history.filter((h) => h.goalId === goalId),
        batch.snapshots.filter((p) => p.goalId === goalId),
        [batch.user],
      ]
    : await Promise.all([
        db
          .select()
          .from(s.goalTasks)
          .where(eq(s.goalTasks.goalId, goalId))
          .orderBy(asc(s.goalTasks.createdAt)),
        db
          .select()
          .from(s.goalMilestones)
          .where(eq(s.goalMilestones.goalId, goalId))
          .orderBy(asc(s.goalMilestones.sortOrder)),
        db
          .select()
          .from(s.goalTaskDependencies)
          .where(eq(s.goalTaskDependencies.goalId, goalId)),
        db.select().from(s.goalLinks).where(eq(s.goalLinks.goalId, goalId)),
        db
          .select()
          .from(s.goalActivity)
          .where(eq(s.goalActivity.goalId, goalId))
          .orderBy(desc(s.goalActivity.createdAt)),
        db
          .select({
            id: s.goalStudySessionLinks.id,
            sessionId: s.studySessions.id,
            taskId: s.goalStudySessionLinks.taskId,
            allocatedSeconds: verifiedAllocation,
            startedAt: s.studySessions.startedAt,
            subjectId: s.studySessions.subjectId,
            title: s.subjects.title,
          })
          .from(s.goalStudySessionLinks)
          .innerJoin(
            s.studySessions,
            and(
              eq(s.studySessions.id, s.goalStudySessionLinks.sessionId),
              eq(s.studySessions.userId, userId),
              eq(s.studySessions.status, "valid"),
              sql`${s.studySessions.durationSeconds}>0`,
            ),
          )
          .innerJoin(s.subjects, eq(s.subjects.id, s.studySessions.subjectId))
          .where(eq(s.goalStudySessionLinks.goalId, goalId)),
        db
          .select()
          .from(s.goalHistory)
          .where(eq(s.goalHistory.goalId, goalId))
          .orderBy(desc(s.goalHistory.createdAt))
          .limit(100),
        db
          .select()
          .from(s.goalProgressSnapshots)
          .where(eq(s.goalProgressSnapshots.goalId, goalId))
          .orderBy(desc(s.goalProgressSnapshots.date))
          .limit(90),
        db
          .select({ timezone: s.users.timezone })
          .from(s.users)
          .where(eq(s.users.id, userId)),
      ]);
  const topicIds = taskRows.flatMap((t) => (t.topicId ? [t.topicId] : []));
  const topicRows = batch
    ? batch.topics
    : topicIds.length
      ? await db
          .select({ id: s.topics.id, status: s.topics.status })
          .from(s.topics)
          .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
          .where(
            and(inArray(s.topics.id, topicIds), eq(s.subjects.userId, userId)),
          )
      : [];
  const tasks: GoalTask[] = taskRows.map((t) => ({
    ...taskSchema.parse({
      ...t,
      dependencyIds: dependencies
        .filter((d) => d.taskId === t.id)
        .map((d) => d.prerequisiteId),
    }),
    id: t.id,
    goalId,
    completedAt: t.completedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
    actualSeconds: sessions
      .filter((link) => link.taskId === t.id)
      .reduce((sum, link) => sum + link.allocatedSeconds, 0),
    topicCompleted: topicRows.some(
      (topic) => topic.id === t.topicId && topic.status === "completed",
    ),
  }));
  const goal: GoalRecord = {
    ...goalSchema.parse({
      ...row,
      subjectIds: links.flatMap((l) => (l.subjectId ? [l.subjectId] : [])),
      topicIds: links.flatMap((l) => (l.topicId ? [l.topicId] : [])),
      resourceIds: links.flatMap((l) => (l.resourceId ? [l.resourceId] : [])),
    }),
    id: goalId,
    userId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  const milestones = milestoneRows.map((m) => ({
    ...milestoneSchema.parse(m),
    id: m.id,
    goalId,
  }));
  const sessionLinks = sessions.map((link) => ({
    ...link,
    startedAt: link.startedAt.toISOString(),
  }));
  const calendar = batch
    ? batch.calendar.filter((c) => c.goalId === goalId)
    : await getGoalCalendar(userId, goalId, user?.timezone ?? "UTC", db);
  return {
    goal,
    tasks,
    milestones,
    activity,
    sessions: sessionLinks,
    calendar: calendar.map((item) => ({
      ...item,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
    })),
    history: history.map((h) => ({
      ...h,
      createdAt: h.createdAt.toISOString(),
    })),
    snapshots,
    progress: calculateGoalProgress(
      goal,
      tasks,
      milestones,
      activity,
      sessionLinks,
      localDay(Date.now(), user?.timezone ?? "UTC"),
    ),
  };
}
/** Load card progress in batches; avoid a query fan-out per goal or leaking large note bodies. */
/** Full details for several goals with one batched query set (descriptions and evidence omitted). */
export async function getGoalDetailsBatch(
  userId: string,
  goalIds: string[],
): Promise<GoalDetail[]> {
  if (!goalIds.length) return [];
  const db = getDb(),
    rows = await db
      .select()
      .from(s.goals)
      .where(and(eq(s.goals.userId, userId), inArray(s.goals.id, goalIds)));
  if (rows.length !== goalIds.length)
    throw new GoalError("recordUnavailable", 404);
  const [tasks, milestones, dependencies, links, activity, sessions, [user]] =
    await Promise.all([
      db
        .select({
          ...getTableColumns(s.goalTasks),
          description: sql<string>`''`,
          evidence: sql<string>`''`,
        })
        .from(s.goalTasks)
        .where(inArray(s.goalTasks.goalId, goalIds)),
      db
        .select({
          ...getTableColumns(s.goalMilestones),
          description: sql<string>`''`,
        })
        .from(s.goalMilestones)
        .where(inArray(s.goalMilestones.goalId, goalIds)),
      db
        .select()
        .from(s.goalTaskDependencies)
        .where(inArray(s.goalTaskDependencies.goalId, goalIds)),
      db.select().from(s.goalLinks).where(inArray(s.goalLinks.goalId, goalIds)),
      db
        .select({
          ...getTableColumns(s.goalActivity),
          evidence: sql<string>`''`,
        })
        .from(s.goalActivity)
        .where(
          and(
            inArray(s.goalActivity.goalId, goalIds),
            inArray(s.goalActivity.type, ["quantity", "outcome"]),
          ),
        ),
      db
        .select({
          goalId: s.goalStudySessionLinks.goalId,
          id: s.goalStudySessionLinks.id,
          sessionId: s.studySessions.id,
          taskId: s.goalStudySessionLinks.taskId,
          allocatedSeconds: verifiedAllocation,
          startedAt: s.studySessions.startedAt,
          subjectId: s.studySessions.subjectId,
          title: s.subjects.title,
        })
        .from(s.goalStudySessionLinks)
        .innerJoin(
          s.studySessions,
          and(
            eq(s.studySessions.id, s.goalStudySessionLinks.sessionId),
            eq(s.studySessions.userId, userId),
            eq(s.studySessions.status, "valid"),
            sql`${s.studySessions.durationSeconds}>0`,
          ),
        )
        .innerJoin(s.subjects, eq(s.subjects.id, s.studySessions.subjectId))
        .where(inArray(s.goalStudySessionLinks.goalId, goalIds)),
      db
        .select({ timezone: s.users.timezone })
        .from(s.users)
        .where(eq(s.users.id, userId)),
    ]);
  const topicIds = [
    ...new Set(tasks.flatMap((t) => (t.topicId ? [t.topicId] : []))),
  ];
  const topics = topicIds.length
    ? await db
        .select({ id: s.topics.id, status: s.topics.status })
        .from(s.topics)
        .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
        .where(
          and(eq(s.subjects.userId, userId), inArray(s.topics.id, topicIds)),
        )
    : [];
  const batch: GoalBatch = {
    goals: rows,
    tasks,
    milestones,
    dependencies,
    links,
    activity,
    sessions,
    user,
    topics,
    history: [],
    snapshots: [],
    calendar: [],
  };
  return Promise.all(goalIds.map((id) => getGoalDetail(userId, id, db, batch)));
}
export async function getGoalCards(
  userId: string,
  goalIds: string[],
): Promise<GoalDetail[]> {
  return (await getGoalDetailsBatch(userId, goalIds)).map((detail) => {
    return {
      ...detail,
      taskCounts: {
        completed: detail.tasks.filter((task) => task.status === "completed")
          .length,
        total: detail.tasks.filter((task) => task.status !== "cancelled")
          .length,
      },
      tasks: detail.tasks.filter((t) => t.id === detail.progress.nextTaskId),
      milestones: detail.milestones
        .filter((m) => detail.progress.milestoneProgress[m.id] < 100)
        .slice(0, 1),
      activity: [],
      sessions: [],
    };
  });
}
export async function goalReferences(userId: string) {
  const db = getDb();
  const [subjects, topics, resources, sessions, [user]] = await Promise.all([
    db
      .select({
        id: s.subjects.id,
        title: s.subjects.title,
        color: s.subjects.displayColor,
        targetDate: s.subjects.targetDate,
        status: s.subjects.status,
      })
      .from(s.subjects)
      .where(eq(s.subjects.userId, userId))
      .orderBy(asc(s.subjects.title))
      .limit(1000),
    db
      .select({
        id: s.topics.id,
        subjectId: s.topics.subjectId,
        title: s.topics.title,
        targetDate: s.topics.targetDate,
      })
      .from(s.topics)
      .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
      .where(and(eq(s.subjects.userId, userId), eq(s.topics.archived, false)))
      .limit(2000),
    db
      .select({
        id: s.resources.id,
        title: s.resources.title,
        subjectId: s.resources.subjectId,
        type: s.resources.type,
      })
      .from(s.resources)
      .where(eq(s.resources.userId, userId))
      .orderBy(desc(s.resources.createdAt))
      .limit(200),
    db
      .select({
        id: s.studySessions.id,
        subjectId: s.studySessions.subjectId,
        startedAt: s.studySessions.startedAt,
        durationSeconds: s.studySessions.durationSeconds,
      })
      .from(s.studySessions)
      .where(
        and(
          eq(s.studySessions.userId, userId),
          eq(s.studySessions.status, "valid"),
        ),
      )
      .orderBy(desc(s.studySessions.startedAt))
      .limit(100),
    db
      .select({ timezone: s.users.timezone })
      .from(s.users)
      .where(eq(s.users.id, userId)),
  ]);
  return {
    subjects,
    topics,
    resources,
    timezone: user?.timezone ?? "UTC",
    sessions: sessions.map((session) => ({
      ...session,
      startedAt: session.startedAt.toISOString(),
    })),
  };
}
export type GoalReferences = Awaited<ReturnType<typeof goalReferences>>;
export async function listGoals(
  userId: string,
  page = 1,
  search = "",
  status = "",
  sort: "deadline" | "progress" | "updated" = "deadline",
) {
  const db = getDb();
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(
    eq(s.goals.userId, userId),
    search ? sql`${s.goals.title} ILIKE ${pattern}` : undefined,
    status ? eq(s.goals.status, status) : undefined,
  );
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(s.goals)
    .where(where);
  const current = Math.max(1, Math.min(page, Math.ceil(total / 20)));
  const orderedQuery = db
    .select({ id: s.goals.id })
    .from(s.goals)
    .where(where)
    .orderBy(
      sort === "updated" ? desc(s.goals.updatedAt) : asc(s.goals.targetDate),
      asc(s.goals.id),
    );
  // Calculated progress depends on tasks, dependencies and verified study allocations.
  // Rank the complete filtered set with the existing model, never a page-local estimate.
  const rows = await (sort === "progress"
    ? orderedQuery
    : orderedQuery.limit(20).offset((current - 1) * 20));
  const [details, statistics] = await Promise.all([
    getGoalCards(
      userId,
      rows.map((row) => row.id),
    ),
    db.execute<{
      active: number;
      completed: number;
      upcoming: number;
      attention: number;
      hours: number;
      weeklyRate: number;
      tasksCompleted: number;
    }>(sql`
    SELECT count(*) FILTER (WHERE status = 'active')::int AS active, count(*) FILTER (WHERE status = 'completed')::int AS completed,
      count(*) FILTER (WHERE status IN ('active','planned') AND target_date BETWEEN (now() AT TIME ZONE (SELECT timezone FROM users WHERE id=${userId}::uuid))::date AND (now() AT TIME ZONE (SELECT timezone FROM users WHERE id=${userId}::uuid))::date + 7)::int AS upcoming,
      count(*) FILTER (WHERE status IN ('active','planned','missedTarget') AND (target_date < (now() AT TIME ZONE (SELECT timezone FROM users WHERE id=${userId}::uuid))::date OR EXISTS(SELECT 1 FROM goal_tasks t WHERE t.goal_id=goals.id AND t.due_date < current_date AND t.status NOT IN ('completed','cancelled'))))::int AS attention,
      coalesce((SELECT sum(least(l.allocated_seconds, floor(ss.duration_seconds::float*l.allocated_seconds/greatest(ss.duration_seconds,(SELECT sum(other.allocated_seconds) FROM goal_study_session_links other WHERE other.session_id=ss.id)))))::float / 3600 FROM goal_study_session_links l JOIN goals g ON g.id=l.goal_id JOIN study_sessions ss ON ss.id=l.session_id WHERE g.user_id=${userId}::uuid AND ss.user_id=${userId}::uuid AND ss.status='valid' AND ss.duration_seconds>0),0) AS hours,
      (SELECT count(*)::int FROM goal_tasks t JOIN goals g ON g.id=t.goal_id WHERE g.user_id=${userId}::uuid AND t.status='completed') AS "tasksCompleted",
      coalesce((SELECT 100.0 * count(*) FILTER(WHERE t.status='completed') / nullif(count(*),0) FROM goal_tasks t JOIN goals g ON g.id=t.goal_id WHERE g.user_id=${userId}::uuid AND (t.completed_at >= now()-interval '7 days' OR t.due_date BETWEEN current_date-7 AND current_date)),0) AS "weeklyRate"
      FROM goals WHERE user_id=${userId}::uuid
  `),
  ]);
  const ranked =
    sort === "progress"
      ? details
          .sort(
            (a, b) =>
              b.progress.percent - a.progress.percent ||
              a.goal.targetDate.localeCompare(b.goal.targetDate) ||
              a.goal.id.localeCompare(b.goal.id),
          )
          .slice((current - 1) * 20, current * 20)
      : details;
  return {
    details: ranked,
    total,
    page: current,
    search,
    status,
    sort,
    statistics: statistics.rows[0],
  };
}

export async function validateReferences(
  tx: DbTransaction,
  userId: string,
  value: {
    subjectIds?: string[];
    topicIds?: string[];
    resourceIds?: string[];
    subjectId?: string | null;
    topicId?: string | null;
  },
) {
  const subjectIds = [
    ...new Set([
      ...(value.subjectIds ?? []),
      ...(value.subjectId ? [value.subjectId] : []),
    ]),
  ];
  if (
    subjectIds.length &&
    (
      await tx
        .select({ id: s.subjects.id })
        .from(s.subjects)
        .where(
          and(
            eq(s.subjects.userId, userId),
            inArray(s.subjects.id, subjectIds),
          ),
        )
    ).length !== subjectIds.length
  )
    throw new GoalError("recordUnavailable", 404);
  const topicIds = [
    ...new Set([
      ...(value.topicIds ?? []),
      ...(value.topicId ? [value.topicId] : []),
    ]),
  ];
  if (topicIds.length) {
    const owned = await tx
      .select({ id: s.topics.id, subjectId: s.topics.subjectId })
      .from(s.topics)
      .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
      .where(
        and(eq(s.subjects.userId, userId), inArray(s.topics.id, topicIds)),
      );
    if (
      owned.length !== topicIds.length ||
      (value.topicId &&
        !owned.some(
          (t) => t.id === value.topicId && t.subjectId === value.subjectId,
        ))
    )
      throw new GoalError("recordUnavailable", 404);
  }
  const resourceIds = [...new Set(value.resourceIds ?? [])];
  if (
    resourceIds.length &&
    (
      await tx
        .select({ id: s.resources.id })
        .from(s.resources)
        .where(
          and(
            eq(s.resources.userId, userId),
            inArray(s.resources.id, resourceIds),
          ),
        )
    ).length !== resourceIds.length
  )
    throw new GoalError("recordUnavailable", 404);
}
export async function mutateGoal(
  userId: string,
  input: GoalMutation,
  transaction?: DbTransaction,
) {
  input = goalMutationSchema.parse(input);
  const work = async (tx: DbTransaction) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.operationId}))`,
    );
    const [receipt] = await tx
      .select()
      .from(s.goalMutations)
      .where(eq(s.goalMutations.id, input.operationId));
    if (receipt) {
      if (receipt.userId !== userId || receipt.goalId !== input.goalId)
        throw new GoalError("recordUnavailable", 404);
      return {
        goalId: receipt.goalId,
        version: receipt.version,
        deleted: input.action.kind === "deleteGoal",
        detail: undefined,
      };
    }
    const [actor] = await tx
      .select({
        status: s.users.status,
        role: s.users.role,
        timezone: s.users.timezone,
      })
      .from(s.users)
      .where(eq(s.users.id, userId))
      .for("share");
    if (actor?.status !== "active" || actor.role !== "learner")
      throw new GoalError("authenticationFailed", 403);
    const [existing] = await tx
      .select()
      .from(s.goals)
      .where(ownedGoal(userId, input.goalId))
      .for("update");
    if (
      (!existing &&
        (input.expectedVersion !== 0 || input.action.kind !== "goal")) ||
      (existing && existing.version !== input.expectedVersion)
    )
      throw new GoalError(
        existing ? "conflict" : "recordUnavailable",
        existing ? 409 : 404,
      );
    const version = (existing?.version ?? 0) + 1,
      action = input.action;
    let reconciled: GoalDetail | undefined;
    if (action.kind === "goal") {
      await validateReferences(tx, userId, action.value);
      const { subjectIds, topicIds, resourceIds, ...values } = action.value;
      if (values.status === "completed") {
        if (!existing) throw new GoalError("outcomeNotConfirmed");
        const detail = await getGoalDetail(userId, existing.id, tx);
        const progress = calculateGoalProgress(
          { ...detail.goal, ...action.value },
          detail.tasks,
          detail.milestones,
          detail.activity,
          detail.sessions,
          localDay(Date.now(), "UTC"),
        );
        if (
          progress.percent < 100 ||
          (values.progressMode === "outcome" && !progress.outcomeConfirmed)
        )
          throw new GoalError("outcomeNotConfirmed");
      }
      if (existing)
        await tx
          .update(s.goals)
          .set({ ...values, version, updatedAt: new Date() })
          .where(ownedGoal(userId, input.goalId));
      else
        await tx
          .insert(s.goals)
          .values({ ...values, id: input.goalId, userId, version });
      await tx.delete(s.goalLinks).where(eq(s.goalLinks.goalId, input.goalId));
      const links = [...new Set(subjectIds)]
        .map((subjectId) => ({ goalId: input.goalId, subjectId }))
        .concat([]);
      if (links.length) await tx.insert(s.goalLinks).values(links);
      if (topicIds.length)
        await tx.insert(s.goalLinks).values(
          [...new Set(topicIds)].map((topicId) => ({
            goalId: input.goalId,
            topicId,
          })),
        );
      if (resourceIds.length)
        await tx.insert(s.goalLinks).values(
          [...new Set(resourceIds)].map((resourceId) => ({
            goalId: input.goalId,
            resourceId,
          })),
        );
    } else if (action.kind === "completion") {
      if (action.completed) {
        await tx
          .insert(s.goalActivity)
          .values({
            goalId: input.goalId,
            type: "outcome",
            amount: 1,
            evidence: "User marked this goal complete.",
            date: localDay(Date.now(), actor.timezone),
            deduplicationKey: "manual-completion",
          })
          .onConflictDoNothing();
      } else {
        await tx
          .delete(s.goalActivity)
          .where(
            and(
              eq(s.goalActivity.goalId, input.goalId),
              eq(s.goalActivity.deduplicationKey, "manual-completion"),
            ),
          );
      }
      await tx
        .update(s.goals)
        .set({
          status: action.completed ? "completed" : "active",
          ...(action.completed ? { progressMode: "outcome" } : {}),
          version,
          updatedAt: new Date(),
        })
        .where(ownedGoal(userId, input.goalId));
    } else if (action.kind === "deleteGoal") {
      // Unassign milestones before cascading the hierarchy's restrictive composite FK.
      await tx
        .update(s.goalTasks)
        .set({ milestoneId: null })
        .where(eq(s.goalTasks.goalId, input.goalId));
      await tx
        .update(s.aiConversations)
        .set({ goalId: null })
        .where(
          and(
            eq(s.aiConversations.goalId, input.goalId),
            eq(s.aiConversations.userId, userId),
          ),
        );
      await tx.delete(s.goals).where(ownedGoal(userId, input.goalId));
    } else {
      const tasks = await tx
        .select()
        .from(s.goalTasks)
        .where(eq(s.goalTasks.goalId, input.goalId));
      const milestones = await tx
        .select()
        .from(s.goalMilestones)
        .where(eq(s.goalMilestones.goalId, input.goalId));
      const requireTask = (id: string | null) => {
        if (id && !tasks.some((t) => t.id === id))
          throw new GoalError("recordUnavailable", 404);
      };
      if (action.kind === "task") {
        if (tasks.length >= 500 && !tasks.some((t) => t.id === action.id))
          throw new GoalError("limitReached");
        await validateReferences(tx, userId, action.value);
        if (
          action.value.milestoneId &&
          !milestones.some((m) => m.id === action.value.milestoneId)
        )
          throw new GoalError("recordUnavailable", 404);
        const dependencies = await tx
          .select()
          .from(s.goalTaskDependencies)
          .where(eq(s.goalTaskDependencies.goalId, input.goalId));
        const graph = tasks
          .filter((t) => t.id !== action.id)
          .map((t) => ({
            id: t.id,
            dependencyIds: dependencies
              .filter((d) => d.taskId === t.id)
              .map((d) => d.prerequisiteId),
          }));
        try {
          assertAcyclic([
            ...graph,
            { id: action.id, dependencyIds: action.value.dependencyIds },
          ]);
        } catch (error) {
          throw new GoalError((error as Error).message);
        }
        if (action.value.status === "completed") {
          const detail = await getGoalDetail(userId, input.goalId, tx);
          if (
            action.value.dependencyIds.some(
              (id) => detail.progress.taskProgress[id] !== 100,
            ) ||
            (action.value.milestoneId &&
              milestones
                .find((m) => m.id === action.value.milestoneId)
                ?.dependencyIds.some(
                  (id) => detail.progress.milestoneProgress[id] !== 100,
                ))
          )
            throw new GoalError("taskBlocked");
        }
        const { dependencyIds, ...value } = action.value;
        const completedAt =
          value.status === "completed"
            ? (tasks.find((t) => t.id === action.id)?.completedAt ?? new Date())
            : null;
        if (tasks.some((t) => t.id === action.id))
          await tx
            .update(s.goalTasks)
            .set({ ...value, completedAt, updatedAt: new Date() })
            .where(
              and(
                eq(s.goalTasks.id, action.id),
                eq(s.goalTasks.goalId, input.goalId),
              ),
            );
        else
          await tx.insert(s.goalTasks).values({
            ...value,
            id: action.id,
            goalId: input.goalId,
            completedAt,
          });
        await tx
          .delete(s.goalTaskDependencies)
          .where(eq(s.goalTaskDependencies.taskId, action.id));
        if (dependencyIds.length)
          await tx.insert(s.goalTaskDependencies).values(
            [...new Set(dependencyIds)].map((prerequisiteId) => ({
              goalId: input.goalId,
              taskId: action.id,
              prerequisiteId,
            })),
          );
      } else if (action.kind === "milestone") {
        if (
          milestones.length >= 50 &&
          !milestones.some((m) => m.id === action.id)
        )
          throw new GoalError("limitReached");
        try {
          assertAcyclic([
            ...milestones.filter((m) => m.id !== action.id),
            { id: action.id, dependencyIds: action.value.dependencyIds },
          ]);
        } catch (error) {
          throw new GoalError((error as Error).message);
        }
        if (milestones.some((m) => m.id === action.id))
          await tx
            .update(s.goalMilestones)
            .set({ ...action.value, updatedAt: new Date() })
            .where(
              and(
                eq(s.goalMilestones.id, action.id),
                eq(s.goalMilestones.goalId, input.goalId),
              ),
            );
        else
          await tx
            .insert(s.goalMilestones)
            .values({ ...action.value, id: action.id, goalId: input.goalId });
      } else if (action.kind === "deleteTask") {
        requireTask(action.id);
        await tx
          .delete(s.goalTasks)
          .where(
            and(
              eq(s.goalTasks.id, action.id),
              eq(s.goalTasks.goalId, input.goalId),
            ),
          );
      } else if (action.kind === "deleteMilestone") {
        if (!milestones.some((m) => m.id === action.id))
          throw new GoalError("recordUnavailable", 404);
        await tx
          .update(s.goalTasks)
          .set({ milestoneId: null })
          .where(
            and(
              eq(s.goalTasks.goalId, input.goalId),
              eq(s.goalTasks.milestoneId, action.id),
            ),
          );
        for (const m of milestones.filter((m) =>
          m.dependencyIds.includes(action.id),
        ))
          await tx
            .update(s.goalMilestones)
            .set({
              dependencyIds: m.dependencyIds.filter((id) => id !== action.id),
            })
            .where(eq(s.goalMilestones.id, m.id));
        await tx
          .delete(s.goalMilestones)
          .where(
            and(
              eq(s.goalMilestones.id, action.id),
              eq(s.goalMilestones.goalId, input.goalId),
            ),
          );
      } else if (action.kind === "activity") {
        requireTask(action.taskId);
        if (action.type === "outcome" && action.amount !== 1)
          throw new GoalError("invalidInput");
        if (
          action.type === "habit" &&
          (!action.taskId ||
            !tasks.find((t) => t.id === action.taskId)?.recurringDays.length)
        )
          throw new GoalError("invalidInput");
        if (action.date > localDay(Date.now(), actor.timezone))
          throw new GoalError("invalidInput");
        await tx
          .insert(s.goalActivity)
          .values({
            ...action,
            goalId: input.goalId,
            deduplicationKey:
              action.type === "habit"
                ? `${action.taskId}:${action.date}`
                : null,
          })
          .onConflictDoNothing();
      } else if (action.kind === "deleteActivity") {
        const rows = await tx
          .delete(s.goalActivity)
          .where(
            and(
              eq(s.goalActivity.id, action.id),
              eq(s.goalActivity.goalId, input.goalId),
            ),
          )
          .returning({ id: s.goalActivity.id });
        if (!rows.length) throw new GoalError("recordUnavailable", 404);
      } else if (action.kind === "linkSession") {
        requireTask(action.taskId);
        const [session] = await tx
          .select()
          .from(s.studySessions)
          .where(
            and(
              eq(s.studySessions.id, action.sessionId),
              eq(s.studySessions.userId, userId),
              eq(s.studySessions.status, "valid"),
            ),
          )
          .for("update");
        if (!session) throw new GoalError("recordUnavailable", 404);
        const sessionDay = localDay(
          session.startedAt.getTime(),
          actor.timezone,
        );
        if (
          sessionDay < existing!.startDate ||
          sessionDay > existing!.targetDate
        )
          throw new GoalError("sessionOutsideGoalDates");
        const allocations = await tx
          .select()
          .from(s.goalStudySessionLinks)
          .where(eq(s.goalStudySessionLinks.sessionId, action.sessionId));
        if (
          allocations
            .filter((l) => l.goalId !== input.goalId)
            .reduce((sum, l) => sum + l.allocatedSeconds, 0) +
            action.seconds >
          session.durationSeconds
        )
          throw new GoalError("sessionAlreadyAllocated");
        await tx
          .insert(s.goalStudySessionLinks)
          .values({
            goalId: input.goalId,
            sessionId: action.sessionId,
            taskId: action.taskId,
            allocatedSeconds: action.seconds,
          })
          .onConflictDoUpdate({
            target: [
              s.goalStudySessionLinks.goalId,
              s.goalStudySessionLinks.sessionId,
            ],
            set: { taskId: action.taskId, allocatedSeconds: action.seconds },
          });
      } else if (action.kind === "unlinkSession")
        await tx
          .delete(s.goalStudySessionLinks)
          .where(
            and(
              eq(s.goalStudySessionLinks.id, action.id),
              eq(s.goalStudySessionLinks.goalId, input.goalId),
            ),
          );
      if (action.kind === "task" || action.kind === "milestone") {
        const [latestTasks, latestMilestones, latestDependencies] =
          await Promise.all([
            tx
              .select()
              .from(s.goalTasks)
              .where(eq(s.goalTasks.goalId, input.goalId)),
            tx
              .select()
              .from(s.goalMilestones)
              .where(eq(s.goalMilestones.goalId, input.goalId)),
            tx
              .select()
              .from(s.goalTaskDependencies)
              .where(eq(s.goalTaskDependencies.goalId, input.goalId)),
          ]);
        try {
          assertAcyclic(
            hierarchyDependencies(
              latestTasks.map((t) => ({
                id: t.id,
                milestoneId: t.milestoneId,
                dependencyIds: latestDependencies
                  .filter((d) => d.taskId === t.id)
                  .map((d) => d.prerequisiteId),
              })),
              latestMilestones,
            ),
          );
        } catch (error) {
          throw new GoalError((error as Error).message);
        }
      }
      await tx
        .update(s.goals)
        .set({ version, updatedAt: new Date() })
        .where(ownedGoal(userId, input.goalId));
    }
    if (action.kind !== "deleteGoal") {
      await tx.insert(s.goalHistory).values({
        goalId: input.goalId,
        action: action.kind,
        targetId: "id" in action ? action.id : input.goalId,
        version,
      });
      const detail = await getGoalDetail(userId, input.goalId, tx),
        day = localDay(Date.now(), actor.timezone);
      await tx
        .insert(s.goalProgressSnapshots)
        .values({
          goalId: input.goalId,
          date: day,
          progress: detail.progress.percent,
          health: detail.progress.health,
        })
        .onConflictDoUpdate({
          target: [
            s.goalProgressSnapshots.goalId,
            s.goalProgressSnapshots.date,
          ],
          set: {
            progress: detail.progress.percent,
            health: detail.progress.health,
          },
        });
      reconciled = {
        ...detail,
        snapshots: [
          { date: day, progress: detail.progress.percent },
          ...detail.snapshots.filter((item) => item.date !== day),
        ].slice(0, 90),
      };
    }
    await tx
      .insert(s.goalMutations)
      .values({ id: input.operationId, userId, goalId: input.goalId, version });
    return {
      goalId: input.goalId,
      version,
      deleted: action.kind === "deleteGoal",
      detail: reconciled,
    };
  };
  return transaction ? work(transaction) : getDb().transaction(work);
}
