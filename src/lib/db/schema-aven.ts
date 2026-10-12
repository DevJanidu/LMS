import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  date,
  index,
  unique,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import {
  users,
  notifications,
  scheduleBlocks,
  goals,
  goalTasks,
} from "./schema";
const id = () => uuid("id").primaryKey().defaultRandom();
const time = (name: string) => timestamp(name, { withTimezone: true });
const created = () => time("created_at").notNull().defaultNow();
export const aiUserPreferences = pgTable("ai_user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  value: jsonb("value")
    .$type<import("@/lib/aven/validation").AiPreferences>()
    .notNull(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    value: jsonb("value")
      .$type<import("@/lib/aven/validation").NotificationPreferences>()
      .notNull(),
    nextCheckAt: time("next_check_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [index("notification_preferences_check_idx").on(t.nextCheckAt)],
);
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id"),
    title: text("title").notNull(),
    sourceKey: text("source_key"),
    summary: text("summary").notNull().default(""),
    summaryMessageCount: integer("summary_message_count").notNull().default(0),
    activeRequestId: uuid("active_request_id"),
    lockedUntil: time("locked_until"),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ai_conversations_owner_idx").on(t.userId, t.updatedAt),
    unique("ai_conversations_owner_unique").on(t.id, t.userId),
    unique("ai_conversations_source_unique").on(t.userId, t.sourceKey),
    foreignKey({
      columns: [t.goalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete("cascade"),
  ],
);
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("complete"),
    context: jsonb("context").$type<Record<string, string>>(),
    createdAt: created(),
  },
  (t) => [
    index("ai_messages_conversation_idx").on(t.conversationId, t.createdAt),
    unique("ai_message_request_role_unique").on(
      t.conversationId,
      t.requestId,
      t.role,
    ),
    check("ai_message_role", sql`${t.role} IN ('user','assistant')`),
  ],
);
export const aiMemory = pgTable(
  "ai_memory",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    source: text("source").notNull().default("user"),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ai_memory_owner_idx").on(t.userId),
    check("ai_memory_source", sql`${t.source} IN ('user','suggestion')`),
  ],
);
export const aiPlanProposals = pgTable(
  "ai_plan_proposals",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id"),
    value: jsonb("value")
      .$type<import("@/lib/aven/validation").AvenProposal>()
      .notNull(),
    status: text("status").notNull().default("pending"),
    result: jsonb("result").$type<{
      goalId?: string;
      blockIds?: string[];
      notificationId?: string;
      undo?: import("@/lib/aven/undo").ProposalUndo;
    }>(),
    expiresAt: time("expires_at").notNull(),
    createdAt: created(),
    resolvedAt: time("resolved_at"),
  },
  (t) => [
    index("ai_proposals_owner_status_idx").on(t.userId, t.status),
    foreignKey({
      columns: [t.conversationId, t.userId],
      foreignColumns: [aiConversations.id, aiConversations.userId],
    }).onDelete("cascade"),
  ],
);
export const aiToolApprovals = pgTable(
  "ai_tool_approvals",
  {
    id: id(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => aiPlanProposals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: text("decision").notNull(),
    createdAt: created(),
  },
  (t) => [unique("ai_approval_proposal_unique").on(t.proposalId)],
);
export const aiUsageRecords = pgTable(
  "ai_usage_records",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requestId: uuid("request_id").notNull(),
    model: text("model").notNull(),
    day: date("day").notNull(),
    reservedTokens: integer("reserved_tokens").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull(),
    status: text("status").notNull().default("reserved"),
    createdAt: created(),
  },
  (t) => [
    index("ai_usage_owner_day_idx").on(t.userId, t.day),
    unique("ai_usage_request_unique").on(t.userId, t.requestId),
  ],
);
export const scheduledCheckIns = pgTable(
  "scheduled_check_ins",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    deduplicationKey: text("deduplication_key").notNull(),
    dueAt: time("due_at").notNull(),
    value: jsonb("value").$type<Record<string, string>>().notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: created(),
  },
  (t) => [
    unique("scheduled_checkin_dedup_unique").on(t.userId, t.deduplicationKey),
    index("scheduled_checkin_due_idx").on(t.status, t.dueAt),
  ],
);
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: id(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: time("next_attempt_at").notNull().defaultNow(),
    leaseUntil: time("lease_until"),
    lastError: text("last_error"),
    deliveredAt: time("delivered_at"),
    createdAt: created(),
  },
  (t) => [
    unique("notification_delivery_channel_unique").on(
      t.notificationId,
      t.channel,
    ),
    index("notification_delivery_due_idx").on(t.status, t.nextAttemptAt),
  ],
);
export const notificationActions = pgTable("notification_actions", {
  notificationId: uuid("notification_id")
    .primaryKey()
    .references(() => notifications.id, { onDelete: "cascade" }),
  value: jsonb("value")
    .$type<{
      kind: string;
      blockId?: string;
      date?: string;
      goalId?: string;
      subjectId?: string;
      topicId?: string;
      startsAt?: string;
      endsAt?: string;
      resolved?: string;
      conversationId?: string;
    }>()
    .notNull(),
});
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: created(),
  },
  (t) => [index("push_subscriptions_owner_idx").on(t.userId)],
);
export const goalScheduleLinks = pgTable(
  "goal_schedule_links",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => goalTasks.id, {
      onDelete: "set null",
    }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => scheduleBlocks.id, { onDelete: "cascade" }),
  },
  (t) => [unique("goal_schedule_block_unique").on(t.goalId, t.blockId)],
);
