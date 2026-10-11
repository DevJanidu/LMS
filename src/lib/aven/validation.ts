import { z } from "zod";
import {
  goalSchema,
  milestoneSchema,
  taskSchema,
} from "@/lib/goals/validation";
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const aiPreferenceSchema = z
  .object({
    consent: z.boolean().default(false),
    coachingStyle: z
      .enum(["supportive", "direct", "analytical"])
      .default("supportive"),
    preferredStudyStart: clock.default("17:00"),
    preferredStudyEnd: clock.default("20:00"),
    dailyTargetMinutes: z.number().int().min(15).max(240).default(90),
    studyDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .default([1, 2, 3, 4, 5]),
    learningPreferences: z.string().trim().max(2000).default(""),
    allowResourceContent: z.boolean().default(false),
    locale: z.enum(["en", "ar", "es", "de"]).default("en"),
  })
  .refine((v) => v.preferredStudyEnd > v.preferredStudyStart, {
    message: "invalidInput",
  });
export const notificationPreferenceSchema = z
  .object({
    enabled: z.boolean().default(false),
    inApp: z.boolean().default(true),
    push: z.boolean().default(false),
    email: z.boolean().default(false),
    morning: z.boolean().default(false),
    morningTime: clock.default("07:00"),
    sessionReminders: z.boolean().default(true),
    leadMinutes: z.number().int().min(0).max(60).default(15),
    missedSessions: z.boolean().default(true),
    goalReminders: z.boolean().default(true),
    graceMinutes: z.number().int().min(5).max(60).default(10),
    randomized: z.boolean().default(false),
    allowedStart: clock.default("12:00"),
    allowedEnd: clock.default("17:00"),
    evening: z.boolean().default(false),
    eveningTime: clock.default("20:00"),
    weekly: z.boolean().default(false),
    weeklyDay: z.number().int().min(0).max(6).default(0),
    inactivityDays: z.number().int().min(2).max(30).default(3),
    quietStart: clock.default("22:00"),
    quietEnd: clock.default("07:00"),
    dailyLimit: z.number().int().min(1).max(10).default(3),
    snoozedUntil: z.iso.datetime().nullable().default(null),
  })
  .refine((v) => v.allowedEnd > v.allowedStart, { message: "invalidInput" });
export type AiPreferences = z.infer<typeof aiPreferenceSchema>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferenceSchema
>;
export const goalPlanSchema = z.object({
  kind: z.literal("goalPlan"),
  goalId: z.uuid().nullable(),
  expectedVersion: z.number().int().min(0),
  explanation: z.string().min(1).max(4000),
  goal: goalSchema,
  milestones: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        value: milestoneSchema,
        dependencyKeys: z.array(z.string().max(80)).max(20),
      }),
    )
    .max(30),
  tasks: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        milestoneKey: z.string().nullable(),
        dependencyKeys: z.array(z.string().max(80)).max(30),
        value: taskSchema,
      }),
    )
    .max(100),
});
export const scheduleProposalSchema = z.object({
  kind: z.literal("schedule"),
  goalId: z.uuid().nullable(),
  expectedVersion: z.number().int().min(0),
  explanation: z.string().min(1).max(4000),
  sessions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        taskId: z.uuid().nullable(),
        subjectId: z.uuid().nullable(),
        topicId: z.uuid().nullable(),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(30),
});
export const proposalSchema = z.discriminatedUnion("kind", [
  goalPlanSchema,
  scheduleProposalSchema,
  z.object({
    kind: z.literal("taskCreate"),
    goalId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    value: taskSchema,
  }),
  z.object({
    kind: z.literal("taskUpdate"),
    goalId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    taskId: z.uuid(),
    value: taskSchema,
  }),
  z.object({
    kind: z.literal("reschedule"),
    blockId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime(),
    date: z.iso.date(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  }),
  z.object({
    kind: z.literal("reminder"),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(2000),
    scheduledFor: z.iso.datetime(),
  }),
]);
export type AvenProposal = z.infer<typeof proposalSchema>;
export const chatSchema = z.object({
  conversationId: z.uuid().nullable(),
  requestId: z.uuid(),
  goalId: z.uuid().nullable(),
  message: z.string().trim().min(1).max(6000),
  planning: z.boolean().default(false),
});
export const preferenceMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enableAven") }),
  z.object({ kind: z.literal("enableReminders") }),
  z.object({
    kind: z.literal("preferences"),
    ai: aiPreferenceSchema,
    notifications: notificationPreferenceSchema,
  }),
  z.object({
    kind: z.literal("memory"),
    id: z.uuid(),
    content: z.string().trim().min(1).max(2000),
  }),
  z.object({ kind: z.literal("deleteMemory"), id: z.uuid() }),
  z.object({ kind: z.literal("deleteConversation"), id: z.uuid() }),
  z.object({ kind: z.literal("deleteAllMemory") }),
  z.object({
    kind: z.literal("summary"),
    id: z.uuid(),
    content: z.string().trim().max(2500),
  }),
]);
