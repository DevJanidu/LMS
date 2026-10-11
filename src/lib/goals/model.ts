import type { GoalInput, MilestoneInput, TaskInput } from "./validation";
export type GoalRecord = GoalInput & {
  id: string;
  userId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type GoalTask = TaskInput & {
  id: string;
  goalId: string;
  completedAt: string | null;
  updatedAt: string;
  actualSeconds: number;
  topicCompleted?: boolean;
};
export type GoalMilestone = MilestoneInput & { id: string; goalId: string };
export interface GoalActivityRecord {
  id: string;
  type: string;
  amount: number;
  evidence: string;
  date: string;
  taskId: string | null;
}
export interface GoalSessionLink {
  id: string;
  sessionId: string;
  taskId: string | null;
  allocatedSeconds: number;
  startedAt: string;
  subjectId: string;
  title: string;
}
export interface GoalDetail {
  goal: GoalRecord;
  tasks: GoalTask[];
  milestones: GoalMilestone[];
  activity: GoalActivityRecord[];
  sessions: GoalSessionLink[];
  calendar?: {
    blockId: string;
    taskId: string | null;
    title: string;
    startsAt: string;
    endsAt: string;
  }[];
  history: { id: string; action: string; version: number; createdAt: string }[];
  snapshots: { date: string; progress: number }[];
  progress: GoalProgress;
}
export interface GoalProgress {
  percent: number;
  preparation: number;
  hours: number;
  quantity: number;
  outcomeConfirmed: boolean;
  health: "onTrack" | "needsAttention" | "atRisk" | "overdue" | "completed";
  daysRemaining: number;
  nextTaskId?: string;
  milestoneProgress: Record<string, number>;
  taskProgress: Record<string, number>;
  blockedIds: string[];
}

export function assertAcyclic(
  nodes: { id: string; dependencyIds: string[] }[],
) {
  const map = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("circularDependency");
    if (visited.has(id)) return;
    const node = map.get(id);
    if (!node) throw new Error("invalidDependency");
    visiting.add(id);
    node.dependencyIds.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  nodes.forEach((node) => visit(node.id));
}
export function hierarchyDependencies(
  tasks: { id: string; milestoneId: string | null; dependencyIds: string[] }[],
  milestones: { id: string; dependencyIds: string[] }[],
) {
  return [
    ...milestones.map((m) => ({
      id: `m:${m.id}`,
      dependencyIds: [
        ...m.dependencyIds.map((id) => `m:${id}`),
        ...tasks.filter((t) => t.milestoneId === m.id).map((t) => `t:${t.id}`),
      ],
    })),
    ...tasks.map((t) => ({
      id: `t:${t.id}`,
      dependencyIds: [
        ...t.dependencyIds.map((id) => `t:${id}`),
        ...(
          milestones.find((m) => m.id === t.milestoneId)?.dependencyIds ?? []
        ).map((id) => `m:${id}`),
      ],
    })),
  ];
}
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const weighted = (items: { progress: number; weight: number }[]) =>
  items.length
    ? items.reduce((sum, item) => sum + item.progress * item.weight, 0) /
      items.reduce((sum, item) => sum + item.weight, 0)
    : 0;
export function calculateGoalProgress(
  goal: GoalRecord,
  tasks: GoalTask[],
  milestones: GoalMilestone[],
  activity: GoalActivityRecord[],
  sessions: GoalSessionLink[],
  today: string,
): GoalProgress {
  const activeTasks = tasks.filter((task) => task.status !== "cancelled");
  const rawProgress = Object.fromEntries(
    activeTasks.map((task) => [
      task.id,
      task.status === "completed"
        ? 100
        : task.progressMode === "derived"
          ? task.topicCompleted
            ? 100
            : task.estimatedMinutes > 0
              ? clamp((task.actualSeconds / (task.estimatedMinutes * 60)) * 100)
              : 0
          : task.manualProgress,
    ]),
  );
  const taskProgress: Record<string, number> = {},
    milestoneProgress: Record<string, number> = {},
    visiting = new Set<string>();
  const taskValue = (id: string): number => {
    if (Object.hasOwn(taskProgress, id)) return taskProgress[id];
    if (visiting.has(`t:${id}`)) return 0;
    const task = activeTasks.find((t) => t.id === id);
    if (!task) return 0;
    visiting.add(`t:${id}`);
    const blocked =
      task.dependencyIds.some((id) => taskValue(id) < 100) ||
      (
        milestones.find((m) => m.id === task.milestoneId)?.dependencyIds ?? []
      ).some((id) => milestoneValue(id) < 100);
    const value = blocked ? 0 : rawProgress[id];
    taskProgress[id] = value;
    visiting.delete(`t:${id}`);
    return value;
  };
  const milestoneValue = (id: string): number => {
    if (Object.hasOwn(milestoneProgress, id)) return milestoneProgress[id];
    if (visiting.has(`m:${id}`)) return 0;
    const m = milestones.find((m) => m.id === id);
    if (!m) return 0;
    visiting.add(`m:${id}`);
    const value = m.dependencyIds.some((id) => milestoneValue(id) < 100)
      ? 0
      : weighted(
          activeTasks
            .filter((t) => t.milestoneId === id)
            .map((t) => ({ progress: taskValue(t.id), weight: t.weight })),
        );
    milestoneProgress[id] = value;
    visiting.delete(`m:${id}`);
    return value;
  };
  activeTasks.forEach((t) => taskValue(t.id));
  milestones.forEach((m) => milestoneValue(m.id));
  const blocks = milestones.map((m) => ({
    progress: milestoneProgress[m.id],
    weight: m.weight,
  }));
  blocks.push(
    ...activeTasks
      .filter((t) => !t.milestoneId)
      .map((t) => ({ progress: taskProgress[t.id], weight: t.weight })),
  );
  const preparation = weighted(blocks);
  // A session is allocated once across goals. Repeated rows must never inflate totals.
  const uniqueSessions = new Map(
    sessions.map((session) => [session.sessionId, session]),
  );
  const hours =
    [...uniqueSessions.values()].reduce(
      (sum, session) => sum + session.allocatedSeconds,
      0,
    ) / 3600;
  const quantity = activity
    .filter((a) => a.type === "quantity")
    .reduce((sum, a) => sum + a.amount, 0);
  const outcomeConfirmed = activity.some(
    (a) => a.type === "outcome" && a.amount === 1,
  );
  const timeProgress = clamp((hours / goal.progressConfig.hoursTarget) * 100),
    quantityProgress = clamp(
      (quantity / goal.progressConfig.quantityTarget) * 100,
    );
  let percent =
    goal.progressMode === "time"
      ? timeProgress
      : goal.progressMode === "quantity"
        ? quantityProgress
        : goal.progressMode === "outcome"
          ? outcomeConfirmed
            ? 100
            : Math.min(99, preparation)
          : preparation;
  if (goal.progressMode === "hybrid") {
    const config = goal.progressConfig;
    percent = weighted(
      [
        { progress: preparation, weight: config.taskWeight },
        { progress: timeProgress, weight: config.timeWeight },
        { progress: quantityProgress, weight: config.quantityWeight },
        { progress: outcomeConfirmed ? 100 : 0, weight: config.outcomeWeight },
      ].filter((item) => item.weight > 0),
    );
    if (config.outcomeWeight > 0 && !outcomeConfirmed)
      percent = Math.min(99, percent);
  }
  const blockedIds = activeTasks
    .filter(
      (task) =>
        task.dependencyIds.some((id) => (taskProgress[id] ?? 0) < 100) ||
        (task.milestoneId &&
          milestones
            .find((m) => m.id === task.milestoneId)
            ?.dependencyIds.some((id) => (milestoneProgress[id] ?? 0) < 100)),
    )
    .map((t) => t.id);
  const priorities = { high: 0, normal: 1, low: 2 };
  const nextTask = activeTasks
    .filter((t) => taskProgress[t.id] < 100 && !blockedIds.includes(t.id))
    .sort(
      (a, b) =>
        priorities[a.priority] - priorities[b.priority] ||
        (a.dueDate ?? goal.targetDate).localeCompare(
          b.dueDate ?? goal.targetDate,
        ),
    )[0];
  const daysRemaining = Math.ceil(
    (Date.parse(goal.targetDate) - Date.parse(today)) / 86400000,
  );
  const duration = Math.max(
    1,
    (Date.parse(goal.targetDate) - Date.parse(goal.startDate)) / 86400000,
  );
  const elapsed = clamp(
    ((Date.parse(today) - Date.parse(goal.startDate)) / 86400000 / duration) *
      100,
  );
  const recent = Math.max(
    Date.parse(goal.updatedAt),
    ...activity.map((a) => Date.parse(a.date)),
    ...sessions.map((s) => Date.parse(s.startedAt)),
  );
  const stalled = Date.parse(today) - recent > 7 * 86400000;
  const health =
    goal.status === "completed"
      ? percent >= 100
        ? "completed"
        : "needsAttention"
      : daysRemaining < 0 && percent < 100
        ? "overdue"
        : percent < elapsed - 30 || (daysRemaining <= 3 && percent < 75)
          ? "atRisk"
          : stalled ||
              percent < elapsed - 10 ||
              activeTasks.some(
                (t) =>
                  t.dueDate && t.dueDate < today && taskProgress[t.id] < 100,
              )
            ? "needsAttention"
            : "onTrack";
  return {
    percent: percent >= 100 ? 100 : Math.min(99, Math.round(percent)),
    preparation: Math.round(preparation),
    hours,
    quantity,
    outcomeConfirmed,
    health,
    daysRemaining,
    nextTaskId: nextTask?.id,
    milestoneProgress,
    taskProgress,
    blockedIds,
  };
}
