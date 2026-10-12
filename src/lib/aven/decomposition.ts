import { z } from "zod";
import { categories, goalSchema } from "@/lib/goals/validation";
import { shiftDay } from "@/lib/analytics";
import type { AvenProposal } from "./validation";
/**
 * Goal decomposition: the model extracts a structure through a strict function schema;
 * this module validates it and derives deadlines, dependencies, effort and the first task.
 */
const day = z.iso.date();
export const goalHierarchyInputSchema = z.object({
  goalId: z
    .uuid()
    .nullable()
    .describe("Existing goal to extend, or null to create a new goal."),
  title: z.string().trim().min(1).max(200).describe("The primary outcome."),
  description: z.string().max(2000),
  category: z.enum(categories),
  targetDate: day.describe("Outcome deadline, YYYY-MM-DD in local time."),
  successCriteria: z.string().max(1000),
  assumptions: z
    .array(z.string().trim().min(1).max(300))
    .max(8)
    .describe("Assumptions you made that the student did not state."),
  allowDuplicate: z
    .boolean()
    .describe(
      "True only after the student confirmed a separate goal despite a similar existing one.",
    ),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(1000),
        successCriteria: z.string().max(500),
        estimatedHours: z.number().min(0.5).max(2000),
        dueDate: day
          .nullable()
          .describe("Null lets Acadence suggest a deadline from effort."),
        dependsOn: z
          .array(z.number().int().min(1).max(12))
          .max(11)
          .describe("1-based numbers of earlier milestones finished first."),
        subjectName: z
          .string()
          .max(150)
          .nullable()
          .describe("Existing Acadence subject name, if one matches."),
        tasks: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(200),
              description: z.string().max(1000),
              estimatedMinutes: z.number().int().min(15).max(6000),
              dueDate: day.nullable(),
              dependsOnPrevious: z
                .boolean()
                .describe("Requires the previous task in this milestone."),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(12),
});
export type GoalHierarchyInput = z.infer<typeof goalHierarchyInputSchema>;
type GoalPlan = Extract<AvenProposal, { kind: "goalPlan" }>;
export interface HierarchyContext {
  today: string;
  subjects: { id: string; title: string }[];
  dailyTargetMinutes: number;
  studyDays: number[];
  /** Verified minutes per week, averaged over the last four weeks. */
  recentWeeklyMinutes: number;
  /** Version of the goal being extended. */
  expectedVersion: number;
  translate: (key: string, values?: Record<string, string | number>) => string;
}
const stopWords = new Set(
  "a an the my to of for and in on with get become land find be learn i want".split(
    " ",
  ),
);
const tokens = (title: string) =>
  new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word && !stopWords.has(word)),
  );
export const normalizeTitle = (title: string) => [...tokens(title)].join(" ");
/** Jaccard similarity of significant title words. */
export function titleSimilarity(a: string, b: string) {
  const left = tokens(a),
    right = tokens(b);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / (left.size + right.size - shared);
}
export function findDuplicateGoals<
  T extends { id: string; title: string; status: string },
>(title: string, goals: T[], ignoreId?: string | null) {
  return goals.filter(
    (goal) =>
      goal.id !== ignoreId &&
      !["completed", "cancelled", "archived"].includes(goal.status) &&
      titleSimilarity(title, goal.title) >= 0.6,
  );
}
const dayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
const spread = (from: string, to: string, fraction: number) =>
  shiftDay(
    from,
    Math.round((dayIndex(to) - dayIndex(from)) * Math.min(1, fraction)),
  );
const clampDay = (value: string, min: string, max: string) =>
  value < min ? min : value > max ? max : value;
export function matchSubject(
  name: string | null,
  subjects: HierarchyContext["subjects"],
) {
  if (!name?.trim()) return null;
  const wanted = name.trim().toLowerCase();
  const exact = subjects.find((item) => item.title.toLowerCase() === wanted);
  if (exact) return exact.id;
  const partial = subjects.filter((item) => {
    const title = item.title.toLowerCase();
    return title.includes(wanted) || wanted.includes(title);
  });
  return partial.length === 1 ? partial[0].id : null;
}
/** Study minutes available from today to the target date at the student's stated pace. */
export function availableMinutes(
  today: string,
  targetDate: string,
  dailyTargetMinutes: number,
  studyDays: number[],
) {
  let total = 0;
  for (let date = today; date <= targetDate; date = shiftDay(date, 1))
    if (studyDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()))
      total += dailyTargetMinutes;
  return total;
}
export function buildGoalHierarchy(
  input: GoalHierarchyInput,
  context: HierarchyContext,
) {
  const { today, translate: t } = context;
  if (input.targetDate < today) throw new Error("invalidDates");
  input.milestones.forEach((milestone, index) => {
    if (milestone.dependsOn.some((number) => number >= index + 1))
      throw new Error("invalidDependency");
  });
  const effort = input.milestones.map((milestone) =>
    Math.max(
      Math.round(milestone.estimatedHours * 60),
      milestone.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    ),
  );
  const total = effort.reduce((sum, value) => sum + value, 0);
  // Suggested deadlines follow cumulative effort; a milestone never ends before its prerequisites.
  const due: string[] = [];
  let cumulative = 0;
  input.milestones.forEach((milestone, index) => {
    cumulative += effort[index];
    let value =
      index === input.milestones.length - 1 && !milestone.dueDate
        ? input.targetDate
        : milestone.dueDate
          ? clampDay(milestone.dueDate, today, input.targetDate)
          : spread(today, input.targetDate, cumulative / total);
    for (const number of milestone.dependsOn)
      if (due[number - 1] > value) value = due[number - 1];
    due.push(value);
  });
  const subjectIds = new Set<string>();
  const milestones: GoalPlan["milestones"] = [],
    tasks: GoalPlan["tasks"] = [];
  input.milestones.forEach((milestone, index) => {
    const key = `m${index + 1}`,
      subjectId = matchSubject(milestone.subjectName, context.subjects),
      windowStart = index ? due[index - 1] : today;
    if (subjectId) subjectIds.add(subjectId);
    milestones.push({
      key,
      dependencyKeys: milestone.dependsOn.map((number) => `m${number}`),
      value: {
        title: milestone.title,
        description: [milestone.description, milestone.successCriteria]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 4000),
        dueDate: due[index],
        weight: Math.max(1, Math.min(1000, Math.round(effort[index] / 60))),
        sortOrder: index,
        dependencyIds: [],
      },
    });
    const taskTotal = milestone.tasks.reduce(
      (sum, task) => sum + task.estimatedMinutes,
      0,
    );
    let taskCumulative = 0;
    milestone.tasks.forEach((task, taskIndex) => {
      taskCumulative += task.estimatedMinutes;
      tasks.push({
        key: `${key}t${taskIndex + 1}`,
        milestoneKey: key,
        dependencyKeys:
          task.dependsOnPrevious && taskIndex ? [`${key}t${taskIndex}`] : [],
        value: {
          title: task.title,
          description: task.description,
          milestoneId: null,
          status: "todo",
          priority: "normal",
          dueDate: task.dueDate
            ? clampDay(task.dueDate, today, due[index])
            : spread(windowStart, due[index], taskCumulative / taskTotal),
          estimatedMinutes: task.estimatedMinutes,
          weight: 1,
          subjectId,
          topicId: null,
          dependencyIds: [],
          recurringDays: [],
          evidence: "",
          progressMode: "manual",
          manualProgress: 0,
        },
      });
    });
  });
  if (tasks.length > 100) throw new Error("limitReached");
  const available = availableMinutes(
    today,
    input.targetDate,
    context.dailyTargetMinutes,
    context.studyDays,
  );
  const feasible = available >= total;
  const firstTask = tasks.find(
    (task) =>
      !task.dependencyKeys.length &&
      !milestones.find((m) => m.key === task.milestoneKey)?.dependencyKeys
        .length,
  );
  const hours = (minutes: number) => Math.round(minutes / 6) / 10;
  const explanation = [
    t("suggested", {
      milestones: milestones.length,
      tasks: tasks.length,
      hours: hours(total),
    }),
    t("deadlines", { from: today, to: input.targetDate }),
    t("capacity", {
      minutes: context.dailyTargetMinutes,
      days: context.studyDays.length,
      hours: hours(available),
    }),
    context.recentWeeklyMinutes > 0
      ? t("recentPace", { hours: hours(context.recentWeeklyMinutes) })
      : t("noRecentPace"),
    feasible ? "" : t("overloaded"),
    firstTask ? t("firstTask", { title: firstTask.value.title }) : "",
    input.assumptions.length
      ? `${t("assumptions")}\n${input.assumptions.map((item) => `• ${item}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  const goal = goalSchema.parse({
    title: input.title,
    description: input.description,
    category: input.category,
    startDate: today,
    targetDate: input.targetDate,
    successCriteria: input.successCriteria,
    estimatedMinutes: total,
    progressMode: "tasks",
    subjectIds: [...subjectIds],
  });
  const proposal: GoalPlan = {
    kind: "goalPlan",
    goalId: input.goalId,
    expectedVersion: context.expectedVersion,
    explanation,
    goal,
    milestones,
    tasks,
    allowDuplicate: input.allowDuplicate,
  };
  return {
    proposal,
    summary: {
      milestones: milestones.map((m) => ({
        title: m.value.title,
        dueDate: m.value.dueDate,
        dependsOn: m.dependencyKeys,
      })),
      totalHours: hours(total),
      availableHours: hours(available),
      feasible,
      firstTask: firstTask?.value.title ?? null,
      suggestedNotVerified: [
        "milestone deadlines",
        "task deadlines",
        "effort estimates",
      ],
    },
  };
}
