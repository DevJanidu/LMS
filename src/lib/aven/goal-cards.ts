import { goalCardSchema, type GoalCard } from "./validation";
import type { GoalProgress } from "@/lib/goals/model";
interface GoalRow {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
}
const card = (
  goal: GoalRow,
  progress: GoalProgress,
  remainingMilestones: string[] = [],
  nextTask: string | null = null,
) =>
  goalCardSchema.safeParse({
    id: goal.id,
    title: goal.title.slice(0, 200),
    status: goal.status,
    targetDate: goal.targetDate,
    percent: Math.round(Math.max(0, Math.min(100, progress.percent))),
    health: progress.health,
    daysRemaining: Number.isFinite(progress.daysRemaining)
      ? Math.round(progress.daysRemaining)
      : null,
    remainingMilestones: remainingMilestones.slice(0, 5),
    nextTask,
  });
/** Build progress cards from verified goal tool output. Invalid shapes yield no card. */
export function goalCardsFromTool(name: string, output: unknown): GoalCard[] {
  if (!output || typeof output !== "object") return [];
  if (name === "getGoalDetails") {
    const detail = output as {
      goal?: GoalRow;
      progress?: GoalProgress;
      milestones?: { id: string; title: string }[];
      tasks?: { id: string; title: string }[];
    };
    if (!detail.goal || !detail.progress) return [];
    const progress = detail.progress;
    const parsed = card(
      detail.goal,
      progress,
      (detail.milestones ?? [])
        .filter((item) => (progress.milestoneProgress?.[item.id] ?? 0) < 100)
        .map((item) => item.title.slice(0, 200)),
      detail.tasks
        ?.find((task) => task.id === progress.nextTaskId)
        ?.title.slice(0, 200) ?? null,
    );
    return parsed.success ? [parsed.data] : [];
  }
  if (name === "getUserGoals") {
    const { goals } = output as {
      goals?: (GoalRow & { progress: GoalProgress })[];
    };
    return (goals ?? [])
      .filter((goal) => goal.status === "active" || goal.status === "planned")
      .slice(0, 4)
      .flatMap((goal) => {
        const parsed = card(goal, goal.progress);
        return parsed.success ? [parsed.data] : [];
      });
  }
  return [];
}
