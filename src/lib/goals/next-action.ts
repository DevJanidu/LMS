import type { GoalDetail } from "./model";
/**
 * Deterministic "next best action" ranking across goals. Every point comes from a recorded
 * fact (deadline, priority, dependency, progress, activity, preference) and is reported as a reason.
 */
export type NextActionReason =
  | { code: "overdue"; date: string }
  | { code: "dueSoon"; date: string }
  | { code: "unblocks"; titles: string[]; count: number }
  | { code: "inProgress" }
  | { code: "highPriority" }
  | { code: "goalAtRisk" }
  | { code: "reportedDifficulty" }
  | { code: "postponed"; count: number }
  | { code: "fitsToday"; minutes: number };
export interface NextAction {
  goalId: string;
  goalTitle: string;
  taskId: string;
  taskTitle: string;
  milestoneTitle: string | null;
  /** The task's subject and topic, so the timer can start in the right place. */
  subjectId?: string | null;
  topicId?: string | null;
  dueDate: string;
  remainingMinutes: number;
  score: number;
  reasons: NextActionReason[];
}
export interface NextActionContext {
  today: string;
  now: number;
  dailyTargetMinutes: number;
  /** Current self-reported difficulty by subject (see lib/learning/signals). */
  difficulty?: Record<string, "needsPractice" | "gettingThere">;
  /** Postponements per topic over the last 30 days. */
  postponedTopics?: Record<string, number>;
}
const ACTIVE = new Set(["active", "planned", "missedTarget"]);
const days = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / 86400000,
  );
function goalCandidates(detail: GoalDetail, context: NextActionContext) {
  const { goal, tasks, milestones, progress, sessions } = detail;
  const open = tasks.filter(
    (task) =>
      task.status !== "completed" &&
      task.status !== "cancelled" &&
      (progress.taskProgress[task.id] ?? 0) < 100,
  );
  const recent = sessions.some(
    (session) => context.now - Date.parse(session.startedAt) < 3 * 86400000,
  );
  return open
    .filter((task) => !progress.blockedIds.includes(task.id))
    .map((task): NextAction => {
      const milestone = milestones.find((item) => item.id === task.milestoneId);
      const dueDate = task.dueDate ?? milestone?.dueDate ?? goal.targetDate;
      const remaining = days(context.today, dueDate);
      const reasons: NextActionReason[] = [];
      let score = 0;
      if (remaining < 0) {
        score += 40;
        reasons.push({ code: "overdue", date: dueDate });
      } else if (remaining <= 2) {
        score += 30;
        reasons.push({ code: "dueSoon", date: dueDate });
      } else if (remaining <= 7) {
        score += 20;
        reasons.push({ code: "dueSoon", date: dueDate });
      } else if (remaining <= 14) score += 10;
      score +=
        goal.priority === "high" ? 15 : goal.priority === "normal" ? 5 : 0;
      score +=
        task.priority === "high" ? 10 : task.priority === "normal" ? 3 : 0;
      if (goal.priority === "high" || task.priority === "high")
        reasons.push({ code: "highPriority" });
      // Direct dependents, plus later milestones when this is the last open task of its milestone.
      const lastInMilestone =
        task.milestoneId &&
        !open.some(
          (other) =>
            other.id !== task.id && other.milestoneId === task.milestoneId,
        );
      const unblocked = open.filter(
        (other) =>
          other.id !== task.id &&
          (other.dependencyIds.includes(task.id) ||
            (lastInMilestone &&
              milestones
                .find((item) => item.id === other.milestoneId)
                ?.dependencyIds.includes(task.milestoneId!))),
      );
      if (unblocked.length) {
        score += Math.min(24, unblocked.length * 8);
        reasons.push({
          code: "unblocks",
          titles: unblocked.slice(0, 2).map((item) => item.title),
          count: unblocked.length,
        });
      }
      const done = progress.taskProgress[task.id] ?? 0;
      if (task.status === "inProgress" || done > 0 || task.actualSeconds > 0) {
        score += 12;
        reasons.push({ code: "inProgress" });
      }
      if (recent) score += 5;
      if (progress.health === "atRisk" || progress.health === "overdue") {
        score += 10;
        reasons.push({ code: "goalAtRisk" });
      }
      // The learner's own report of difficulty, and work repeatedly put off, move a task up.
      const difficulty = task.subjectId
        ? context.difficulty?.[task.subjectId]
        : undefined;
      if (difficulty) {
        score += difficulty === "needsPractice" ? 8 : 4;
        reasons.push({ code: "reportedDifficulty" });
      }
      const postponed = task.topicId
        ? (context.postponedTopics?.[task.topicId] ?? 0)
        : 0;
      if (postponed >= 2) {
        score += 6;
        reasons.push({ code: "postponed", count: postponed });
      }
      const remainingMinutes = Math.max(
        0,
        Math.round(task.estimatedMinutes * (1 - done / 100)),
      );
      if (
        remainingMinutes > 0 &&
        remainingMinutes <= context.dailyTargetMinutes
      ) {
        score += 6;
        reasons.push({
          code: "fitsToday",
          minutes: context.dailyTargetMinutes,
        });
      } else if (remainingMinutes > context.dailyTargetMinutes * 3) score -= 4;
      return {
        goalId: goal.id,
        goalTitle: goal.title,
        taskId: task.id,
        taskTitle: task.title,
        milestoneTitle: milestone?.title ?? null,
        subjectId: task.subjectId,
        topicId: task.topicId,
        dueDate,
        remainingMinutes,
        score,
        reasons,
      };
    });
}
/** Highest-scoring actions; with no goal filter, at most one per goal so the list stays varied. */
export function rankNextActions(
  details: GoalDetail[],
  context: NextActionContext,
  limit = 3,
  goalId?: string | null,
) {
  const ranked = details
    .filter((detail) => ACTIVE.has(detail.goal.status))
    .filter((detail) => !goalId || detail.goal.id === goalId)
    .flatMap((detail) => goalCandidates(detail, context))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.dueDate.localeCompare(b.dueDate) ||
        a.taskTitle.localeCompare(b.taskTitle),
    );
  if (goalId) return ranked.slice(0, limit);
  const seen = new Set<string>();
  return ranked
    .filter((item) => !seen.has(item.goalId) && seen.add(item.goalId))
    .slice(0, limit);
}
