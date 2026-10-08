import { relations, sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const time = (name: string) => timestamp(name, { withTimezone: true });
const created = () => time("created_at").notNull().defaultNow();
const updated = () => time("updated_at").notNull().defaultNow();
const id = () => uuid("id").primaryKey().defaultRandom();
export const roleEnum = pgEnum("user_role", ["learner", "super_admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "deactivated"]);
export const subjectStatusEnum = pgEnum("subject_status", ["active", "archived"]);
export const topicStatusEnum = pgEnum("topic_status", ["not_started", "in_progress", "completed"]);
export const resourceTypeEnum = pgEnum("resource_type", ["file", "link", "video", "note"]);
export const sessionSourceEnum = pgEnum("session_source", ["timer", "manual"]);
export const sessionStatusEnum = pgEnum("session_status", ["valid", "discarded"]);

export const users = pgTable("users", {
  id: id(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  role: roleEnum("role").notNull().default("learner"), status: userStatusEnum("status").notNull().default("active"),
  timezone: text("timezone").notNull().default("UTC"), learningContext: text("learning_context"),
  acceptedTermsAt: time("accepted_terms_at"), dateOfBirth: date("date_of_birth"), onboardingCompletedAt: time("onboarding_completed_at"),
  lastActiveAt: time("last_active_at").notNull().defaultNow(), createdAt: created(), updatedAt: updated(),
});
export const preferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  weeklyTargetMinutes: integer("weekly_target_minutes").notNull().default(0), theme: text("theme").notNull().default("auto"),
  weekStartDay: integer("week_start_day").notNull().default(1), reminders: boolean("reminders").notNull().default(true),
  highestStreak: integer("highest_streak").notNull().default(0),
}, t => [check("preferences_highest_streak_nonnegative", sql`${t.highestStreak} >= 0`), check("preferences_goal_nonnegative", sql`${t.weeklyTargetMinutes} >= 0`), check("preferences_week_start", sql`${t.weekStartDay} IN (0, 1)`), check("preferences_theme", sql`${t.theme} IN ('auto', 'light', 'dark')`)]);
export const authSessions = pgTable("sessions", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(), expiresAt: time("expires_at").notNull(), ipAddress: text("ip_address"), userAgent: text("user_agent"),
  createdAt: created(), updatedAt: updated(),
}, t => [index("sessions_user_idx").on(t.userId)]);
export const accounts = pgTable("accounts", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(), password: text("password"),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: time("access_token_expires_at"), refreshTokenExpiresAt: time("refresh_token_expires_at"), scope: text("scope"),
  createdAt: created(), updatedAt: updated(),
}, t => [index("accounts_user_idx").on(t.userId), unique("accounts_provider_identity_unique").on(t.providerId, t.accountId)]);
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(authSessions, { relationName: "session_userId" }),
  accounts: many(accounts, { relationName: "account_userId" }),
}));
export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id], relationName: "session_userId" }),
}));
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id], relationName: "account_userId" }),
}));
export const verifications = pgTable("verifications", {
  id: id(), identifier: text("identifier").notNull(), value: text("value").notNull(), expiresAt: time("expires_at").notNull(), createdAt: created(), updatedAt: updated(),
}, t => [index("verifications_identifier_idx").on(t.identifier)]);
export const rateLimits = pgTable("auth_rate_limits", {
  id: id(), key: text("key").notNull().unique(), count: integer("count").notNull(), lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const subjects = pgTable("subjects", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), title: text("title").notNull(),
  description: text("description").notNull().default(""), displayColor: text("display_color").notNull().default("brand"),
  targetDate: date("target_date"), status: subjectStatusEnum("status").notNull().default("active"), createdAt: created(), updatedAt: updated(),
}, t => [index("subjects_user_idx").on(t.userId), unique("subjects_owner_unique").on(t.id, t.userId)]);
export const topics = pgTable("topics", {
  id: id(), subjectId: uuid("subject_id").notNull().references(() => subjects.id, { onDelete: "cascade" }), title: text("title").notNull(),
  description: text("description"), status: topicStatusEnum("status").notNull().default("not_started"), targetDate: date("target_date"),
  sortOrder: integer("sort_order").notNull().default(0), completedAt: time("completed_at"), archived: boolean("archived").notNull().default(false),
  createdAt: created(), updatedAt: updated(),
}, t => [index("topics_subject_order_idx").on(t.subjectId, t.sortOrder), unique("topics_subject_unique").on(t.id, t.subjectId)]);
export const resources = pgTable("resources", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").notNull(), topicId: uuid("topic_id"), type: resourceTypeEnum("type").notNull(), title: text("title").notNull(),
  url: text("url"), storageKey: text("storage_key").unique(), textContent: text("text_content"), mimeType: text("mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0), createdAt: created(),
}, t => [foreignKey({ columns: [t.subjectId, t.userId], foreignColumns: [subjects.id, subjects.userId] }).onDelete("cascade"),
  foreignKey({ columns: [t.topicId, t.subjectId], foreignColumns: [topics.id, topics.subjectId] }).onDelete("cascade"),
  index("resources_owner_subject_idx").on(t.userId, t.subjectId), index("resources_topic_idx").on(t.topicId), check("resources_size_nonnegative", sql`${t.sizeBytes} >= 0`)]);
export const activeTimers = pgTable("active_timers", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }), subjectId: uuid("subject_id").notNull(), topicId: uuid("topic_id"),
  startedAt: time("started_at").notNull().defaultNow(), pausedAt: time("paused_at"), pausedTotalSeconds: integer("paused_total_seconds").notNull().default(0),
  confirmedUntilSeconds: integer("confirmed_until_seconds").notNull().default(21600), focusGoal: text("focus_goal"), needsConfirmation: boolean("needs_confirmation").notNull().default(false),
}, t => [foreignKey({ columns: [t.subjectId, t.userId], foreignColumns: [subjects.id, subjects.userId] }).onDelete("cascade"),
  foreignKey({ columns: [t.topicId, t.subjectId], foreignColumns: [topics.id, topics.subjectId] }).onDelete("cascade"),
  index("active_timers_subject_idx").on(t.subjectId), index("active_timers_topic_idx").on(t.topicId), check("timer_pause_nonnegative", sql`${t.pausedTotalSeconds} >= 0`)]);
export const studySessions = pgTable("study_sessions", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), subjectId: uuid("subject_id").notNull(), topicId: uuid("topic_id"),
  startedAt: time("started_at").notNull(), endedAt: time("ended_at").notNull(), durationSeconds: integer("duration_seconds").notNull(),
  status: sessionStatusEnum("status").notNull().default("valid"), note: text("note"), source: sessionSourceEnum("source").notNull(), createdAt: created(),
}, t => [foreignKey({ columns: [t.subjectId, t.userId], foreignColumns: [subjects.id, subjects.userId] }).onDelete("cascade"),
  foreignKey({ columns: [t.topicId, t.subjectId], foreignColumns: [topics.id, topics.subjectId] }).onDelete("cascade"),
  index("study_sessions_owner_start_idx").on(t.userId, t.startedAt), index("study_sessions_subject_idx").on(t.subjectId), index("study_sessions_topic_idx").on(t.topicId),
  check("session_end_after_start", sql`${t.endedAt} > ${t.startedAt}`), check("session_duration_nonnegative", sql`${t.durationSeconds} >= 0`)]);
export const scheduleBlocks = pgTable("schedule_blocks", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), subjectId: uuid("subject_id"), topicId: uuid("topic_id"), title: text("title").notNull(),
  startsAt: time("starts_at").notNull(), endsAt: time("ends_at").notNull(), recurrenceRule: jsonb("recurrence_rule").$type<{ weekdays: number[]; until?: string }>(),
  timezone: text("timezone").notNull(), note: text("note"), displayColor: text("display_color").notNull().default("brand"), createdAt: created(), updatedAt: updated(),
}, t => [foreignKey({ columns: [t.subjectId, t.userId], foreignColumns: [subjects.id, subjects.userId] }).onDelete("cascade"),
  foreignKey({ columns: [t.topicId, t.subjectId], foreignColumns: [topics.id, topics.subjectId] }).onDelete("cascade"),
  index("schedule_blocks_owner_start_idx").on(t.userId, t.startsAt), index("schedule_blocks_subject_idx").on(t.subjectId), index("schedule_blocks_topic_idx").on(t.topicId),
  check("block_end_after_start", sql`${t.endsAt} > ${t.startsAt}`), check("block_topic_requires_subject", sql`${t.topicId} IS NULL OR ${t.subjectId} IS NOT NULL`)]);
export const scheduleExceptions = pgTable("schedule_exceptions", {
  overrides: jsonb("overrides").$type<{ subjectId?: string | null; topicId?: string | null; note?: string | null }>(),
  id: id(), blockId: uuid("block_id").notNull().references(() => scheduleBlocks.id, { onDelete: "cascade" }), date: date("date").notNull(), isCancelled: boolean("is_cancelled").notNull().default(false),
  newStartsAt: time("new_starts_at"), newEndsAt: time("new_ends_at"),
  newTitle: text("new_title"), newNote: text("new_note"), newColor: text("new_color"),
  newSubjectId: uuid("new_subject_id").references(() => subjects.id, { onDelete: "cascade" }), newTopicId: uuid("new_topic_id"),
}, t => [unique("schedule_exception_date_unique").on(t.blockId, t.date),
  foreignKey({ columns: [t.newTopicId, t.newSubjectId], foreignColumns: [topics.id, topics.subjectId] }).onDelete("cascade"),
  check("exception_topic_requires_subject", sql`${t.newTopicId} IS NULL OR ${t.newSubjectId} IS NOT NULL`),
  check("exception_end_after_start", sql`(${t.newStartsAt} IS NULL AND ${t.newEndsAt} IS NULL) OR (${t.newStartsAt} IS NOT NULL AND ${t.newEndsAt} IS NOT NULL AND ${t.newEndsAt} > ${t.newStartsAt})`)]);
/** Committed responses make network retries safe, including deleted records. */
export const calendarMutations = pgTable("calendar_mutations", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  result: jsonb("result").$type<import("@/lib/calendar/model").CalendarChange>(),
  createdAt: created(),
}, t => [index("calendar_mutations_created_idx").on(t.createdAt)]);
export const notifications = pgTable("notifications", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), type: text("type").notNull(), title: text("title").notNull(), body: text("body").notNull(),
  deduplicationKey: text("deduplication_key").notNull(), scheduledFor: time("scheduled_for").notNull(), readAt: time("read_at"), createdAt: created(),
}, t => [unique("notifications_dedup_unique").on(t.userId, t.deduplicationKey), index("notifications_user_idx").on(t.userId)]);
export const auditLogs = pgTable("audit_logs", {
  id: id(), actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }), action: text("action").notNull(), targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(), metadata: jsonb("metadata").$type<Record<string, string | number | boolean>>(), createdAt: created(),
}, t => [index("audit_logs_created_idx").on(t.createdAt)]);
export const appSettings = pgTable("app_settings", { key: text("key").primaryKey(), value: jsonb("value").$type<number | string | boolean>().notNull() });
export const pendingObjectDeletions = pgTable("pending_object_deletions", {
  id: id(), storageKey: text("storage_key").notNull().unique(), attempts: integer("attempts").notNull().default(0), createdAt: created(),
});
export const pendingUploads = pgTable("pending_uploads", {
  id: id(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), subjectId: uuid("subject_id").notNull(), topicId: uuid("topic_id"),
  storageKey: text("storage_key").notNull().unique(), title: text("title").notNull(), mimeType: text("mime_type").notNull(), sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(), createdAt: created(),
}, t => [foreignKey({ columns: [t.subjectId, t.userId], foreignColumns: [subjects.id, subjects.userId] }).onDelete("cascade"),
  foreignKey({ columns: [t.topicId, t.subjectId], foreignColumns: [topics.id, topics.subjectId] }).onDelete("cascade"), index("pending_uploads_user_idx").on(t.userId), check("upload_size_nonnegative", sql`${t.sizeBytes} >= 0`)]);
