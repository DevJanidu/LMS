import { z } from "zod";
import {
  goalSchema,
  milestoneSchema,
  taskSchema,
} from "@/lib/goals/validation";
import {
  confidenceLevels,
  learningSignalSchema,
  MAX_SIGNALS,
} from "@/lib/learning/signals";
import { MAX_MENTIONS, mentionReferenceSchema } from "./commands";
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const aiPreferenceSchema = z
  .object({
    consent: z.boolean().default(false),
    onboardingComplete: z.boolean().default(false),
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
    locale: z.preprocess(() => "en", z.literal("en")).default("en"),
    /** Self-reported difficulty and confidence; one malformed entry never blocks the account. */
    learningSignals: z
      .array(learningSignalSchema)
      .max(MAX_SIGNALS)
      .default([])
      .catch([]),
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
  /** Set only after the student confirmed a separate goal despite a similar existing one. */
  allowDuplicate: z.boolean().default(false),
});
export const scheduleProposalSchema = z.object({
  kind: z.literal("schedule"),
  goalId: z.uuid().nullable(),
  expectedVersion: z.number().int().min(0),
  explanation: z.string().min(1).max(4000),
  /** Identifies a recommendation so a rejection quiets the same suggestion for a while. */
  recommendationKey: z.string().max(160).optional(),
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
  z.object({
    kind: z.literal("calendarChanges"),
    explanation: z.string().min(1).max(4000),
    changes: z
      .array(
        z.discriminatedUnion("action", [
          z.object({
            action: z.literal("move"),
            /** Recurring sessions: this occurrence, this and later ones, or the whole series. */
            scope: z.enum(["one", "future", "all"]).default("one"),
            /** Occurrences in the next year that the change affects (preview only). */
            affected: z.number().int().min(0).optional(),
            title: z.string().max(200).optional(),
            previousStartsAt: z.iso.datetime().optional(),
            previousEndsAt: z.iso.datetime().optional(),
            blockId: z.uuid(),
            date: z.iso.date(),
            expectedUpdatedAt: z.iso.datetime(),
            startsAt: z.iso.datetime(),
            endsAt: z.iso.datetime(),
          }),
          z.object({
            action: z.literal("cancel"),
            affected: z.number().int().min(0).optional(),
            title: z.string().max(200).optional(),
            blockId: z.uuid(),
            date: z.iso.date(),
            expectedUpdatedAt: z.iso.datetime(),
            scope: z.enum(["one", "future", "all"]),
          }),
        ]),
      )
      .min(1)
      .max(30),
  }),
  z.object({
    kind: z.literal("calendarCreate"),
    explanation: z.string().min(1).max(4000),
    title: z.string().trim().min(1).max(150),
    subjectId: z.uuid().nullable(),
    topicId: z.uuid().nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    timezone: z.string().max(100),
    repeat: z.enum(["once", "weekly"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    until: z.iso.date().nullable(),
    /** Conflicting occurrence dates the student agreed to skip; stored as cancelled exceptions. */
    skipDates: z.array(z.iso.date()).max(400).default([]),
    occurrences: z.number().int().min(0).optional(),
    conflicts: z
      .array(
        z.object({
          date: z.iso.date(),
          title: z.string().max(200),
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
        }),
      )
      .max(20)
      .default([]),
  }),
  z.object({
    kind: z.literal("goalCompletion"),
    goalId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    completed: z.boolean(),
    title: z.string().max(200),
  }),
  z.object({
    kind: z.literal("milestoneCreate"),
    goalId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    value: milestoneSchema,
  }),
  z.object({
    kind: z.literal("studyPreferences"),
    explanation: z.string().max(4000),
    patch: z.object({
      dailyTargetMinutes: z.number().int().min(15).max(240).nullable(),
      preferredStudyStart: clock.nullable(),
      preferredStudyEnd: clock.nullable(),
      studyDays: z
        .array(z.number().int().min(0).max(6))
        .min(1)
        .max(7)
        .nullable(),
      coachingStyle: z.enum(["supportive", "direct", "analytical"]).nullable(),
      learningPreferences: z.string().max(2000).nullable(),
    }),
  }),
  z.object({
    kind: z.literal("reminderPreferences"),
    explanation: z.string().max(4000),
    patch: z.object({
      enabled: z.boolean().nullable(),
      morning: z.boolean().nullable(),
      evening: z.boolean().nullable(),
      weekly: z.boolean().nullable(),
      randomized: z.boolean().nullable(),
      sessionReminders: z.boolean().nullable(),
      missedSessions: z.boolean().nullable(),
      goalReminders: z.boolean().nullable(),
      quietStart: clock.nullable(),
      quietEnd: clock.nullable(),
      morningTime: clock.nullable(),
      eveningTime: clock.nullable(),
      dailyLimit: z.number().int().min(1).max(10).nullable(),
    }),
  }),
  z.object({
    kind: z.literal("resourceOrganization"),
    resourceId: z.uuid(),
    expectedHash: z.string().length(64),
    title: z.string().trim().min(1).max(150).nullable(),
    subjectId: z.uuid(),
    topicId: z.uuid().nullable(),
    explanation: z.string().max(4000),
  }),
  z.object({
    kind: z.literal("memory"),
    content: z.string().trim().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("learningSignal"),
    subjectId: z.uuid(),
    topicId: z.uuid().nullable(),
    subjectTitle: z.string().max(200),
    topicTitle: z.string().max(200).nullable(),
    level: z.enum(confidenceLevels),
    explanation: z.string().max(4000),
  }),
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
  retryRequestId: z.uuid().nullable().optional(),
  notificationId: z.uuid().nullable().optional(),
  regenerate: z.boolean().optional(),
  /** Structured @ references (type and ID only); resolved and permission-checked on the server. */
  references: z.array(mentionReferenceSchema).max(MAX_MENTIONS).optional(),
});
/** Server-built goal snapshot rendered as a progress card; never parsed from model text. */
export const goalCardSchema = z.object({
  id: z.uuid(),
  title: z.string().max(200),
  status: z.string().max(40),
  targetDate: z.string().max(10).nullable(),
  percent: z.number().min(0).max(100),
  health: z.string().max(40),
  daysRemaining: z.number().int().nullable(),
  remainingMilestones: z.array(z.string().max(200)).max(5),
  nextTask: z.string().max(200).nullable(),
});
export type GoalCard = z.infer<typeof goalCardSchema>;
export const goalCardsSchema = z.array(goalCardSchema).max(4);
export const preferenceMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enableAven") }),
  z.object({
    kind: z.literal("onboard"),
    /** Each permission is a separate choice; only AI processing consent is implied by finishing. */
    reminders: z.boolean(),
    email: z.boolean().default(false),
    push: z.boolean().default(false),
    resourceContent: z.boolean().default(false),
    locale: z.preprocess(() => "en", z.literal("en")).optional(),
  }),
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
  z.object({
    kind: z.literal("renameConversation"),
    id: z.uuid(),
    title: z.string().trim().min(1).max(80),
  }),
  z.object({ kind: z.literal("deleteAllMemory") }),
  z.object({
    kind: z.literal("summary"),
    id: z.uuid(),
    content: z.string().trim().max(2500),
  }),
]);
/** Next Best Action results shown in chat; produced by the deterministic ranking engine. */
export const nextActionsSchema = z
  .array(
    z.object({
      goalId: z.uuid(),
      goalTitle: z.string().max(200),
      taskId: z.uuid(),
      taskTitle: z.string().max(200),
      milestoneTitle: z.string().max(200).nullable(),
      subjectId: z.uuid().nullable().optional(),
      topicId: z.uuid().nullable().optional(),
      dueDate: z.iso.date(),
      remainingMinutes: z.number().int().min(0),
      score: z.number(),
      reasons: z
        .array(
          z.discriminatedUnion("code", [
            z.object({ code: z.literal("overdue"), date: z.iso.date() }),
            z.object({ code: z.literal("dueSoon"), date: z.iso.date() }),
            z.object({
              code: z.literal("unblocks"),
              titles: z.array(z.string().max(200)).max(2),
              count: z.number().int().min(1),
            }),
            z.object({ code: z.literal("inProgress") }),
            z.object({ code: z.literal("highPriority") }),
            z.object({ code: z.literal("goalAtRisk") }),
            z.object({ code: z.literal("reportedDifficulty") }),
            z.object({
              code: z.literal("postponed"),
              count: z.number().int().min(1),
            }),
            z.object({
              code: z.literal("fitsToday"),
              minutes: z.number().int().min(0),
            }),
          ]),
        )
        .max(9),
    }),
  )
  .max(5);
export type NextActionCard = z.infer<typeof nextActionsSchema>[number];
