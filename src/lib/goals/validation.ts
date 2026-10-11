import { z } from "zod";
export const goalStatuses = [
  "draft",
  "planned",
  "active",
  "paused",
  "completed",
  "missedTarget",
  "archived",
  "cancelled",
] as const;
export const categories = [
  "academic",
  "career",
  "certification",
  "skill",
  "personal",
  "custom",
] as const;
export const priorities = ["low", "normal", "high"] as const;
export const progressModes = [
  "tasks",
  "time",
  "quantity",
  "outcome",
  "hybrid",
] as const;
const day = z.iso.date(),
  ids = z.array(z.uuid()).max(100).default([]),
  text = z.string().trim().max(4000).default("");
export const progressConfigSchema = z.object({
  hoursTarget: z.number().positive().max(100000).default(100),
  quantityTarget: z.number().positive().max(1000000).default(20),
  taskWeight: z.number().int().min(0).max(100).default(1),
  timeWeight: z.number().int().min(0).max(100).default(0),
  quantityWeight: z.number().int().min(0).max(100).default(0),
  outcomeWeight: z.number().int().min(0).max(100).default(0),
});
export const goalSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: text,
    category: z.enum(categories).default("academic"),
    customCategory: z.string().trim().max(80).default(""),
    startDate: day,
    targetDate: day,
    priority: z.enum(priorities).default("normal"),
    motivation: text,
    successCriteria: text,
    estimatedMinutes: z.number().int().min(0).max(10000000).default(0),
    status: z.enum(goalStatuses).default("active"),
    progressMode: z.enum(progressModes).default("tasks"),
    progressConfig: progressConfigSchema.default(() =>
      progressConfigSchema.parse({}),
    ),
    subjectIds: ids,
    topicIds: ids,
    resourceIds: ids,
    reminders: z.boolean().default(true),
  })
  .refine((v) => v.targetDate >= v.startDate, {
    path: ["targetDate"],
    message: "invalidDates",
  })
  .refine(
    (v) =>
      v.progressMode !== "hybrid" ||
      v.progressConfig.taskWeight +
        v.progressConfig.timeWeight +
        v.progressConfig.quantityWeight +
        v.progressConfig.outcomeWeight >
        0,
    { message: "invalidWeights" },
  );
export const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: text,
  dueDate: day.nullable().default(null),
  weight: z.number().int().positive().max(1000).default(1),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  dependencyIds: ids,
});
export const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: text,
    milestoneId: z.uuid().nullable().default(null),
    status: z
      .enum(["todo", "inProgress", "completed", "cancelled"])
      .default("todo"),
    priority: z.enum(priorities).default("normal"),
    dueDate: day.nullable().default(null),
    estimatedMinutes: z.number().int().min(0).max(1000000).default(30),
    weight: z.number().int().positive().max(1000).default(1),
    subjectId: z.uuid().nullable().default(null),
    topicId: z.uuid().nullable().default(null),
    dependencyIds: ids,
    recurringDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    evidence: text,
    progressMode: z.enum(["manual", "derived"]).default("manual"),
    manualProgress: z.number().int().min(0).max(100).default(0),
  })
  .refine((v) => !v.topicId || Boolean(v.subjectId), {
    message: "topicRequiresSubject",
  });
export const goalMutationSchema = z.object({
  operationId: z.uuid(),
  goalId: z.uuid(),
  expectedVersion: z.number().int().min(0),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("goal"), value: goalSchema }),
    z.object({ kind: z.literal("completion"), completed: z.boolean() }),
    z.object({ kind: z.literal("deleteGoal") }),
    z.object({
      kind: z.literal("milestone"),
      id: z.uuid(),
      value: milestoneSchema,
    }),
    z.object({ kind: z.literal("deleteMilestone"), id: z.uuid() }),
    z.object({ kind: z.literal("task"), id: z.uuid(), value: taskSchema }),
    z.object({ kind: z.literal("deleteTask"), id: z.uuid() }),
    z.object({
      kind: z.literal("activity"),
      taskId: z.uuid().nullable(),
      type: z.enum(["quantity", "outcome", "habit", "reflection"]),
      amount: z.number().int().min(0).max(1000000),
      evidence: z.string().trim().min(1).max(4000),
      date: day,
    }),
    z.object({ kind: z.literal("deleteActivity"), id: z.uuid() }),
    z.object({
      kind: z.literal("linkSession"),
      sessionId: z.uuid(),
      taskId: z.uuid().nullable(),
      seconds: z.number().int().min(1).max(86400),
    }),
    z.object({ kind: z.literal("unlinkSession"), id: z.uuid() }),
  ]),
});
export type GoalInput = z.infer<typeof goalSchema>;
export type MilestoneInput = z.infer<typeof milestoneSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type GoalMutation = z.infer<typeof goalMutationSchema>;
