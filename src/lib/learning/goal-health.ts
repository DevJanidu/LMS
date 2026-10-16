import { shiftDay } from "@/lib/analytics";
import type { GoalDetail } from "@/lib/goals/model";
/**
 * Explainable goal health. Every status comes with the rules that produced it and the
 * recorded facts behind them; there is no opaque score.
 *
 * At risk (any):
 *   pastTarget          target date passed with open work
 *   capacityShortfall   remaining estimated minutes exceed available study minutes before the target
 *   overdueBlocksUpcoming  an overdue task is a prerequisite of open work due within 7 days
 * Needs attention (any, when not at risk):
 *   overdueMilestone    a milestone's due date passed and it is incomplete
 *   overdueTasks        open tasks are past their due date
 *   tightCapacity       remaining minutes exceed 75% of available minutes
 *   allBlocked          every open task waits on prerequisites
 *   noRecentProgress    started 7+ days ago with no study, activity or completion in 7 days
 * On track: none of the above.
 *
 * Available minutes = daily target × the learner's study days from today to the target date.
 * Remaining minutes = Σ estimated minutes × (1 − task progress) over open tasks.
 */
export type GoalHealthStatus = "onTrack" | "needsAttention" | "atRisk";
export type GoalHealthReason =
  | { code: "pastTarget"; targetDate: string; openTasks: number }
  | { code: "capacityShortfall"; remainingMinutes: number; availableMinutes: number }
  | {
      code: "overdueBlocksUpcoming";
      taskId: string;
      task: string;
      dueDate: string;
      blocks: string[];
      nextDueDate: string;
    }
  | {
      code: "overdueMilestone";
      milestoneId: string;
      milestone: string;
      dueDate: string;
      openTasks: number;
    }
  | { code: "overdueTasks"; count: number; titles: string[]; taskIds: string[] }
  | { code: "tightCapacity"; remainingMinutes: number; availableMinutes: number }
  | { code: "allBlocked"; openTasks: number }
  | { code: "noRecentProgress"; days: number };
const AT_RISK = new Set(["pastTarget", "capacityShortfall", "overdueBlocksUpcoming"]);
const dayIndex = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86400000;
export function studyDaysBetween(from: string, to: string, studyDays: number[]) {
  let count = 0;
  for (let day = from; day <= to && count < 3700; day = shiftDay(day, 1))
    if (studyDays.includes(new Date(`${day}T12:00:00Z`).getUTCDay())) count++;
  return count;
}
export function evaluateGoalHealth(
  detail: GoalDetail,
  context: {
    today: string;
    now: number;
    dailyTargetMinutes: number;
    studyDays: number[];
  },
) {
  const { goal, tasks, milestones, progress, sessions, activity, snapshots } =
    detail;
  const open = tasks.filter(
    (task) =>
      task.status !== "completed" &&
      task.status !== "cancelled" &&
      (progress.taskProgress[task.id] ?? 0) < 100,
  );
  const milestoneDue = (taskMilestone: string | null) =>
    milestones.find((m) => m.id === taskMilestone)?.dueDate ?? null;
  const dueOf = (task: (typeof tasks)[number]) =>
    task.dueDate ?? milestoneDue(task.milestoneId);
  const overdueTasks = open.filter((task) => {
    const due = dueOf(task);
    return due !== null && due < context.today;
  });
  const overdueMilestones = milestones
    .filter(
      (m) =>
        m.dueDate &&
        m.dueDate < context.today &&
        (progress.milestoneProgress[m.id] ?? 0) < 100,
    )
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const remainingMinutes = Math.round(
    open.reduce(
      (sum, task) =>
        sum +
        task.estimatedMinutes * (1 - (progress.taskProgress[task.id] ?? 0) / 100),
      0,
    ),
  );
  const availableMinutes =
    goal.targetDate < context.today
      ? 0
      : studyDaysBetween(context.today, goal.targetDate, context.studyDays) *
        context.dailyTargetMinutes;
  const reasons: GoalHealthReason[] = [];
  if (open.length && goal.targetDate < context.today)
    reasons.push({
      code: "pastTarget",
      targetDate: goal.targetDate,
      openTasks: open.length,
    });
  else if (open.length && remainingMinutes > availableMinutes)
    reasons.push({ code: "capacityShortfall", remainingMinutes, availableMinutes });
  // Overdue prerequisites that hold back work due within a week.
  for (const task of overdueTasks) {
    const lastOpenInMilestone =
      task.milestoneId &&
      !open.some((o) => o.id !== task.id && o.milestoneId === task.milestoneId);
    const dependents = open.filter(
      (other) =>
        other.id !== task.id &&
        (other.dependencyIds.includes(task.id) ||
          (lastOpenInMilestone &&
            milestones
              .find((m) => m.id === other.milestoneId)
              ?.dependencyIds.includes(task.milestoneId!))),
    );
    const soon = dependents
      .map((other) => ({ other, due: dueOf(other) ?? goal.targetDate }))
      .filter(
        ({ due }) =>
          due >= context.today && dayIndex(due) - dayIndex(context.today) <= 7,
      )
      .sort((a, b) => a.due.localeCompare(b.due));
    if (soon.length) {
      reasons.push({
        code: "overdueBlocksUpcoming",
        taskId: task.id,
        task: task.title,
        dueDate: dueOf(task)!,
        blocks: soon.slice(0, 3).map(({ other }) => other.title),
        nextDueDate: soon[0].due,
      });
      break;
    }
  }
  const missed = overdueMilestones[0];
  if (missed)
    reasons.push({
      code: "overdueMilestone",
      milestoneId: missed.id,
      milestone: missed.title,
      dueDate: missed.dueDate!,
      openTasks: open.filter((task) => task.milestoneId === missed.id).length,
    });
  if (overdueTasks.length)
    reasons.push({
      code: "overdueTasks",
      count: overdueTasks.length,
      titles: overdueTasks.slice(0, 3).map((task) => task.title),
      taskIds: overdueTasks.slice(0, 3).map((task) => task.id),
    });
  if (
    open.length &&
    remainingMinutes <= availableMinutes &&
    remainingMinutes > availableMinutes * 0.75
  )
    reasons.push({ code: "tightCapacity", remainingMinutes, availableMinutes });
  if (open.length && open.every((task) => progress.blockedIds.includes(task.id)))
    reasons.push({ code: "allBlocked", openTasks: open.length });
  const lastWork = Math.max(
    0,
    ...sessions.map((item) => Date.parse(item.startedAt)),
    ...activity.map((item) => Date.parse(`${item.date}T12:00:00Z`)),
    ...tasks.map((task) => (task.completedAt ? Date.parse(task.completedAt) : 0)),
  );
  if (
    open.length &&
    dayIndex(context.today) - dayIndex(goal.startDate) >= 7 &&
    context.now - lastWork > 7 * 86400000
  )
    reasons.push({
      code: "noRecentProgress",
      days: lastWork
        ? Math.floor((context.now - lastWork) / 86400000)
        : dayIndex(context.today) - dayIndex(goal.startDate),
    });
  const status: GoalHealthStatus = reasons.some((r) => AT_RISK.has(r.code))
    ? "atRisk"
    : reasons.length
      ? "needsAttention"
      : "onTrack";
  // Trend compares today's progress with the latest daily snapshot at least a week old.
  const baseline = [...snapshots]
    .filter((item) => dayIndex(context.today) - dayIndex(item.date) >= 7)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const trend = !baseline
    ? "unknown"
    : progress.percent > baseline.progress
      ? "improving"
      : "flat";
  return {
    goalId: goal.id,
    title: goal.title,
    status,
    reasons,
    metrics: {
      totalMilestones: milestones.length,
      completedMilestones: milestones.filter(
        (m) => (progress.milestoneProgress[m.id] ?? 0) >= 100,
      ).length,
      overdueMilestones: overdueMilestones.length,
      pendingTasks: open.length,
      overdueTasks: overdueTasks.length,
      blockedTasks: open.filter((task) => progress.blockedIds.includes(task.id))
        .length,
      percent: progress.percent,
      remainingMinutes,
      availableMinutes,
      daysRemaining: progress.daysRemaining,
      targetDate: goal.targetDate,
      trend,
      trendBaseline: baseline ?? null,
      upcomingDeadlines: [
        ...milestones
          .filter(
            (m) =>
              m.dueDate &&
              m.dueDate >= context.today &&
              (progress.milestoneProgress[m.id] ?? 0) < 100,
          )
          .map((m) => ({ title: m.title, date: m.dueDate! })),
        ...open
          .filter((task) => task.dueDate && task.dueDate >= context.today)
          .map((task) => ({ title: task.title, date: task.dueDate! })),
      ]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5),
    },
  };
}
export type GoalHealth = ReturnType<typeof evaluateGoalHealth>;
