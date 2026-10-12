import type { GoalDetail } from "@/lib/goals/model";
/**
 * Goal monitoring from verified records only. Each alert states facts (dates, counts);
 * nothing here estimates progress or predicts outcomes.
 */
export type GoalAlertKind =
  | "deadline"
  | "missedMilestone"
  | "blocked"
  | "inactive"
  | "attention";
export interface GoalAlert {
  kind: GoalAlertKind;
  goalId: string;
  goalTitle: string;
  remainingTasks: number;
  daysLeft: number;
  milestoneTitle?: string;
  /** A schedule draft can help: unblocked work remains. */
  recoverable: boolean;
}
const severity: GoalAlertKind[] = [
  "deadline",
  "missedMilestone",
  "attention",
  "blocked",
  "inactive",
];
const ACTIVE = new Set(["active", "planned", "missedTarget"]);
const dayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
export function goalAlerts(
  details: GoalDetail[],
  context: { today: string; now: number },
): GoalAlert[] {
  const alerts: GoalAlert[] = [];
  for (const { goal, tasks, milestones, progress, sessions, activity } of details) {
    if (!ACTIVE.has(goal.status)) continue;
    const open = tasks.filter(
      (task) =>
        task.status !== "completed" &&
        task.status !== "cancelled" &&
        (progress.taskProgress[task.id] ?? 0) < 100,
    );
    const unblocked = open.filter((task) => !progress.blockedIds.includes(task.id));
    const daysLeft = Math.round(dayIndex(goal.targetDate) - dayIndex(context.today));
    const base = {
      goalId: goal.id,
      goalTitle: goal.title,
      remainingTasks: open.length,
      daysLeft,
      recoverable: unblocked.length > 0,
    };
    const missed = milestones
      .filter(
        (m) =>
          m.dueDate &&
          m.dueDate < context.today &&
          (progress.milestoneProgress[m.id] ?? 0) < 100,
      )
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
    const recentWork =
      sessions.some((s) => context.now - Date.parse(s.startedAt) < 7 * 86400000) ||
      activity.some((a) => dayIndex(context.today) - dayIndex(a.date) < 7) ||
      tasks.some(
        (t) => t.completedAt && context.now - Date.parse(t.completedAt) < 7 * 86400000,
      );
    const startedLongAgo = dayIndex(context.today) - dayIndex(goal.startDate) >= 7;
    const found: GoalAlertKind[] = [];
    if (open.length && daysLeft >= 0 && daysLeft <= 7) found.push("deadline");
    if (missed) found.push("missedMilestone");
    if (progress.health === "atRisk" || progress.health === "overdue")
      found.push("attention");
    if (open.length && !unblocked.length) found.push("blocked");
    if (open.length && startedLongAgo && !recentWork) found.push("inactive");
    const kind = severity.find((item) => found.includes(item));
    if (kind)
      alerts.push({
        ...base,
        kind,
        ...(kind === "missedMilestone" ? { milestoneTitle: missed!.title } : {}),
      });
  }
  return alerts.sort(
    (a, b) =>
      severity.indexOf(a.kind) - severity.indexOf(b.kind) ||
      a.daysLeft - b.daysLeft,
  );
}
/** Week bucket (Monday date) so the same alert repeats at most weekly. */
export function weekKey(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
