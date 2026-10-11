import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import {
  getGoalDetail,
  GoalError,
  mutateGoal,
  validateReferences,
} from "@/lib/goals/service";
import { mutateCalendar, getCalendarBlock } from "@/lib/services/calendar";
import { getScheduleBlocksInRange } from "@/lib/services/lists";
import { getOccurrences } from "@/lib/schedule";
import { localDay, shiftDay } from "@/lib/analytics";
import { proposalSchema, aiPreferenceSchema } from "./validation";
import { assertAcyclic, hierarchyDependencies } from "@/lib/goals/model";
import { validateSchedule } from "./planning";

export async function storeProposal(
  userId: string,
  conversationId: string | null,
  raw: unknown,
) {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) throw new GoalError("invalidProposal");
  const value = parsed.data;
  if ("goalId" in value && value.goalId)
    await getGoalDetail(userId, value.goalId);
  if (value.kind === "reschedule")
    await getCalendarBlock(userId, value.blockId);
  if (conversationId) {
    const [owned] = await getDb()
      .select({ id: s.aiConversations.id })
      .from(s.aiConversations)
      .where(
        and(
          eq(s.aiConversations.id, conversationId),
          eq(s.aiConversations.userId, userId),
        ),
      );
    if (!owned) throw new GoalError("recordUnavailable", 404);
  }
  const [proposal] = await getDb()
    .insert(s.aiPlanProposals)
    .values({
      userId,
      conversationId,
      value,
      expiresAt: new Date(Date.now() + 86400000),
    })
    .returning();
  return {
    id: proposal.id,
    status: proposal.status,
    value,
    expiresAt: proposal.expiresAt.toISOString(),
  };
}
export async function resolveProposal(
  userId: string,
  id: string,
  decision: "approve" | "reject",
) {
  return getDb().transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId))
      .for("update");
    if (user?.status !== "active" || user.role !== "learner")
      throw new GoalError("authenticationFailed", 403);
    const [proposal] = await tx
      .select()
      .from(s.aiPlanProposals)
      .where(
        and(eq(s.aiPlanProposals.id, id), eq(s.aiPlanProposals.userId, userId)),
      )
      .for("update");
    if (!proposal) throw new GoalError("recordUnavailable", 404);
    if (proposal.status !== "pending")
      return { status: proposal.status, result: proposal.result };
    if (proposal.expiresAt.getTime() < Date.now())
      throw new GoalError("proposalExpired", 409);
    const value = proposalSchema.parse(proposal.value),
      result: {
        goalId?: string;
        blockIds?: string[];
        notificationId?: string;
      } = {};
    if (decision === "approve") {
      if (value.kind === "goalPlan") {
        const goalId = value.goalId ?? randomUUID();
        let version = value.expectedVersion;
        const mIds = new Map(
            value.milestones.map((m) => [m.key, randomUUID()]),
          ),
          tIds = new Map(value.tasks.map((t) => [t.key, randomUUID()]));
        if (
          mIds.size !== value.milestones.length ||
          tIds.size !== value.tasks.length
        )
          throw new GoalError("invalidProposal");
        const resolve = (keys: string[], map: Map<string, string>) =>
          keys.map((key) => {
            const id = map.get(key);
            if (!id) throw new GoalError("invalidDependency");
            return id;
          });
        const milestoneValues = value.milestones.map((m) => ({
          id: mIds.get(m.key)!,
          value: { ...m.value, dependencyIds: resolve(m.dependencyKeys, mIds) },
        }));
        const taskValues = value.tasks.map((t) => ({
          id: tIds.get(t.key)!,
          value: {
            ...t.value,
            milestoneId: t.milestoneKey
              ? (mIds.get(t.milestoneKey) ?? null)
              : null,
            dependencyIds: resolve(t.dependencyKeys, tIds),
            status: "todo" as const,
            manualProgress: 0,
          },
        }));
        try {
          assertAcyclic(
            milestoneValues.map((m) => ({
              id: m.id,
              dependencyIds: m.value.dependencyIds,
            })),
          );
          assertAcyclic(
            taskValues.map((t) => ({
              id: t.id,
              dependencyIds: t.value.dependencyIds,
            })),
          );
        } catch (error) {
          throw new GoalError((error as Error).message);
        }
        if (
          value.tasks.some((t) => t.milestoneKey && !mIds.has(t.milestoneKey))
        )
          throw new GoalError("invalidProposal");
        const saved = await mutateGoal(
          userId,
          {
            operationId: randomUUID(),
            goalId,
            expectedVersion: version,
            action: {
              kind: "goal",
              value: { ...value.goal, status: "active" },
            },
          },
          tx,
        );
        version = saved.version;
        const current = await getGoalDetail(userId, goalId, tx);
        if (
          current.tasks.length + taskValues.length > 500 ||
          current.milestones.length + milestoneValues.length > 50
        )
          throw new GoalError("limitReached");
        await validateReferences(tx, userId, {
          subjectIds: taskValues.flatMap((t) =>
            t.value.subjectId ? [t.value.subjectId] : [],
          ),
          topicIds: taskValues.flatMap((t) =>
            t.value.topicId ? [t.value.topicId] : [],
          ),
        });
        const topicIds = [
          ...new Set(
            taskValues.flatMap((t) =>
              t.value.topicId ? [t.value.topicId] : [],
            ),
          ),
        ];
        const topics = topicIds.length
          ? await tx
              .select({ id: s.topics.id, subjectId: s.topics.subjectId })
              .from(s.topics)
              .where(inArray(s.topics.id, topicIds))
          : [];
        if (
          taskValues.some(
            (task) =>
              task.value.topicId &&
              !topics.some(
                (topic) =>
                  topic.id === task.value.topicId &&
                  topic.subjectId === task.value.subjectId,
              ),
          )
        )
          throw new GoalError("recordUnavailable", 404);
        try {
          assertAcyclic(
            hierarchyDependencies(
              [
                ...current.tasks,
                ...taskValues.map((t) => ({
                  id: t.id,
                  milestoneId: t.value.milestoneId,
                  dependencyIds: t.value.dependencyIds,
                })),
              ],
              [
                ...current.milestones,
                ...milestoneValues.map((m) => ({
                  id: m.id,
                  dependencyIds: m.value.dependencyIds,
                })),
              ],
            ),
          );
        } catch (error) {
          throw new GoalError((error as Error).message);
        }
        if (milestoneValues.length)
          await tx
            .insert(s.goalMilestones)
            .values(
              milestoneValues.map((m) => ({ ...m.value, id: m.id, goalId })),
            );
        if (taskValues.length)
          await tx.insert(s.goalTasks).values(
            taskValues.map(({ id, value }) => {
              const { dependencyIds, ...task } = value;
              void dependencyIds;
              return { ...task, id, goalId };
            }),
          );
        const edges = taskValues.flatMap((task) =>
          task.value.dependencyIds.map((prerequisiteId) => ({
            goalId,
            taskId: task.id,
            prerequisiteId,
          })),
        );
        if (edges.length) await tx.insert(s.goalTaskDependencies).values(edges);
        version++;
        await tx
          .update(s.goals)
          .set({ version, updatedAt: new Date() })
          .where(eq(s.goals.id, goalId));
        await tx
          .insert(s.goalHistory)
          .values({ goalId, action: "plan", targetId: id, version });
        const planned = await getGoalDetail(userId, goalId, tx),
          day = localDay(Date.now(), user.timezone);
        await tx
          .insert(s.goalProgressSnapshots)
          .values({
            goalId,
            date: day,
            progress: planned.progress.percent,
            health: planned.progress.health,
          })
          .onConflictDoUpdate({
            target: [
              s.goalProgressSnapshots.goalId,
              s.goalProgressSnapshots.date,
            ],
            set: {
              progress: planned.progress.percent,
              health: planned.progress.health,
            },
          });
        result.goalId = goalId;
      } else if (value.kind === "taskCreate" || value.kind === "taskUpdate") {
        await mutateGoal(
          userId,
          {
            operationId: randomUUID(),
            goalId: value.goalId,
            expectedVersion: value.expectedVersion,
            action: {
              kind: "task",
              id: value.kind === "taskCreate" ? randomUUID() : value.taskId,
              value: value.value,
            },
          },
          tx,
        );
        result.goalId = value.goalId;
      } else if (value.kind === "schedule" || value.kind === "reschedule") {
        const [preferences] = await tx
          .select()
          .from(s.aiUserPreferences)
          .where(eq(s.aiUserPreferences.userId, userId));
        const prefs = aiPreferenceSchema.parse(preferences?.value ?? {});
        const sessions =
          value.kind === "schedule"
            ? value.sessions
            : [
                {
                  title: "",
                  taskId: null,
                  subjectId: null,
                  topicId: null,
                  startsAt: value.startsAt,
                  endsAt: value.endsAt,
                },
              ];
        if (
          sessions.some(
            (item) =>
              Date.parse(item.startsAt) < Date.now() ||
              Date.parse(item.endsAt) <= Date.parse(item.startsAt) ||
              Date.parse(item.endsAt) > Date.now() + 31 * 86400000,
          )
        )
          throw new GoalError("invalidSchedule");
        const from = localDay(
            Math.min(...sessions.map((item) => Date.parse(item.startsAt))),
            user.timezone,
          ),
          to = shiftDay(
            localDay(
              Math.max(...sessions.map((item) => Date.parse(item.endsAt))),
              user.timezone,
            ),
            1,
          );
        const existing = await getScheduleBlocksInRange(
          userId,
          { from, to },
          user.timezone,
        );
        const occurrences = getOccurrences(existing, from, to).filter(
          (item) =>
            value.kind !== "reschedule" ||
            item.block.id !== value.blockId ||
            item.date !== value.date,
        );
        try {
          validateSchedule(
            sessions,
            occurrences,
            Date.now(),
            prefs.dailyTargetMinutes,
            user.timezone,
          );
        } catch (error) {
          throw new GoalError((error as Error).message);
        }
        if (value.kind === "reschedule") {
          const change = await mutateCalendar(
            userId,
            {
              operationId: randomUUID(),
              expectedUpdatedAt: value.expectedUpdatedAt,
              command: {
                kind: "move",
                id: value.blockId,
                date: value.date,
                scope: "one",
                startsAt: value.startsAt,
                endsAt: value.endsAt,
                newSeriesId: randomUUID(),
              },
            },
            tx,
          );
          result.blockIds = change.blocks.map((b) => b.id);
        } else {
          const detail = value.goalId
            ? await getGoalDetail(userId, value.goalId, tx)
            : undefined;
          if (detail && detail.goal.version !== value.expectedVersion)
            throw new GoalError("conflict", 409);
          result.goalId = value.goalId ?? undefined;
          result.blockIds = [];
          for (const session of value.sessions) {
            if (
              session.taskId &&
              (!detail ||
                !detail.tasks.some(
                  (task) =>
                    task.id === session.taskId &&
                    !detail.progress.blockedIds.includes(task.id),
                ))
            )
              throw new GoalError("taskBlocked");
            const [subject] = session.subjectId
              ? await tx
                  .select()
                  .from(s.subjects)
                  .where(
                    and(
                      eq(s.subjects.id, session.subjectId),
                      eq(s.subjects.userId, userId),
                    ),
                  )
              : [];
            const blockId = randomUUID();
            await mutateCalendar(
              userId,
              {
                operationId: randomUUID(),
                command: {
                  kind: "create",
                  value: {
                    id: blockId,
                    subjectId: session.subjectId ?? undefined,
                    topicId: session.topicId ?? undefined,
                    title: session.title,
                    startsAt: session.startsAt,
                    endsAt: session.endsAt,
                    timezone: user.timezone,
                    repeat: "once",
                    weekdays: [],
                    color:
                      (subject?.displayColor as
                        "brand" | "success" | "orange" | "purple") ?? "brand",
                    exceptions: [],
                  },
                },
              },
              tx,
            );
            if (value.goalId)
              await tx.insert(s.goalScheduleLinks).values({
                goalId: value.goalId,
                taskId: session.taskId,
                blockId,
              });
            result.blockIds.push(blockId);
          }
        }
      } else if (value.kind === "reminder") {
        if (Date.parse(value.scheduledFor) < Date.now())
          throw new GoalError("invalidSchedule");
        await tx.insert(s.scheduledCheckIns).values({
          userId,
          kind: "manual",
          deduplicationKey: `manual:${id}`,
          dueAt: new Date(value.scheduledFor),
          value: { title: value.title, body: value.body },
        });
      }
    }
    await tx
      .insert(s.aiToolApprovals)
      .values({ proposalId: id, userId, decision });
    await tx.insert(s.auditLogs).values({
      actorUserId: userId,
      action: `aven.proposal.${decision}`,
      targetType: "aiProposal",
      targetId: id,
      metadata: { kind: value.kind },
    });
    const status = decision === "approve" ? "approved" : "rejected";
    await tx
      .update(s.aiPlanProposals)
      .set({ status, result, resolvedAt: new Date() })
      .where(eq(s.aiPlanProposals.id, id));
    return { status, result };
  });
}
export async function proposalList(userId: string, conversationId?: string) {
  return getDb()
    .select()
    .from(s.aiPlanProposals)
    .where(
      and(
        eq(s.aiPlanProposals.userId, userId),
        conversationId
          ? eq(s.aiPlanProposals.conversationId, conversationId)
          : undefined,
      ),
    )
    .orderBy(sql`${s.aiPlanProposals.createdAt} DESC`)
    .limit(50);
}
