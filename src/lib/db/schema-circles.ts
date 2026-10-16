import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { studySessions, subjects, users } from "./schema";
const time = (name: string) => timestamp(name, { withTimezone: true });
const created = () => time("created_at").notNull().defaultNow();
const id = () => uuid("id").primaryKey().defaultRandom();

/** Social privacy. Absence of a row means the defaults below. */
export const socialProfiles = pgTable("social_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  /** Whether a friend request sent to this account's email is delivered. */
  acceptRequests: boolean("accept_requests").notNull().default(true),
  /** private: nobody; friends: accepted friends; groups: friends and fellow group members. */
  activityVisibility: text("activity_visibility").$type<"private" | "friends" | "groups">().notNull().default("friends"),
  /** Subject names in activity and history; totals are shared either way. */
  shareSubjects: boolean("share_subjects").notNull().default(false),
  shareStreak: boolean("share_streak").notNull().default(true),
  /** Appear on friends' leaderboards (always visible in one's own). */
  showOnLeaderboards: boolean("show_on_leaderboards").notNull().default(true),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [check("social_profiles_visibility", sql`${t.activityVisibility} IN ('private', 'friends', 'groups')`)]);

export const friendRequests = pgTable("friend_requests", {
  id: id(),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "accepted" | "declined" | "cancelled">().notNull().default("pending"),
  createdAt: created(),
  respondedAt: time("responded_at"),
}, t => [
  check("friend_requests_not_self", sql`${t.senderId} <> ${t.recipientId}`),
  check("friend_requests_status", sql`${t.status} IN ('pending', 'accepted', 'declined', 'cancelled')`),
  // One open request per pair, in either direction.
  uniqueIndex("friend_requests_one_pending").on(sql`least(${t.senderId}, ${t.recipientId})`, sql`greatest(${t.senderId}, ${t.recipientId})`).where(sql`${t.status} = 'pending'`),
  index("friend_requests_recipient_idx").on(t.recipientId, t.status),
  index("friend_requests_sender_idx").on(t.senderId, t.status),
]);

/**
 * Every "add friend" attempt, whether or not it reached an account. The sender
 * sees these rows (masked email only), so the list looks the same for addresses
 * that exist, do not exist, have blocked them or do not accept requests.
 */
export const friendInvitations = pgTable("friend_invitations", {
  id: id(),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emailHash: text("email_hash").notNull(),
  maskedEmail: text("masked_email").notNull(),
  /** Set only when a request was actually delivered; never shown to the sender. */
  requestId: uuid("request_id").references(() => friendRequests.id, { onDelete: "set null" }),
  createdAt: created(),
}, t => [unique("friend_invitations_sender_email").on(t.senderId, t.emailHash), index("friend_invitations_sender_idx").on(t.senderId, t.createdAt)]);

/** One row per pair, lower id first, so a duplicate friendship cannot exist. */
export const friendships = pgTable("friendships", {
  userLow: uuid("user_low").notNull().references(() => users.id, { onDelete: "cascade" }),
  userHigh: uuid("user_high").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: created(),
}, t => [primaryKey({ columns: [t.userLow, t.userHigh] }), check("friendships_ordered", sql`${t.userLow} < ${t.userHigh}`), index("friendships_high_idx").on(t.userHigh)]);

/** Blocks override friendships, requests and invitations in both directions. */
export const userBlocks = pgTable("user_blocks", {
  blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: created(),
}, t => [primaryKey({ columns: [t.blockerId, t.blockedId] }), check("user_blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`), index("user_blocks_blocked_idx").on(t.blockedId)]);

export const studyGroups = pgTable("study_groups", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("brand"),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [check("study_groups_name_length", sql`char_length(${t.name}) BETWEEN 1 AND 80`), index("study_groups_owner_idx").on(t.ownerId)]);

export const studyGroupMembers = pgTable("study_group_members", {
  groupId: uuid("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<"owner" | "admin" | "member">().notNull().default("member"),
  joinedAt: time("joined_at").notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.groupId, t.userId] }),
  check("study_group_members_role", sql`${t.role} IN ('owner', 'admin', 'member')`),
  uniqueIndex("study_group_members_one_owner").on(t.groupId).where(sql`${t.role} = 'owner'`),
  index("study_group_members_user_idx").on(t.userId),
]);

export const studyGroupInvitations = pgTable("study_group_invitations", {
  id: id(),
  groupId: uuid("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  inviterId: uuid("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inviteeId: uuid("invitee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "accepted" | "declined" | "cancelled">().notNull().default("pending"),
  createdAt: created(),
  respondedAt: time("responded_at"),
}, t => [
  check("study_group_invitations_status", sql`${t.status} IN ('pending', 'accepted', 'declined', 'cancelled')`),
  uniqueIndex("study_group_invitations_one_pending").on(t.groupId, t.inviteeId).where(sql`${t.status} = 'pending'`),
  index("study_group_invitations_invitee_idx").on(t.inviteeId, t.status),
]);

/**
 * Server-observed active spans of the running timer. Opened on start/resume,
 * extended by heartbeats, closed on pause/finish. Only the span covered by
 * heartbeats (plus a short grace) can earn competition credit.
 */
export const studyTimerSegments = pgTable("study_timer_segments", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** active_timers.started_at of the timer this span belongs to. */
  timerStartedAt: time("timer_started_at").notNull(),
  startedAt: time("started_at").notNull(),
  lastSeenAt: time("last_seen_at").notNull(),
  endedAt: time("ended_at"),
}, t => [
  uniqueIndex("study_timer_segments_one_open").on(t.userId).where(sql`${t.endedAt} IS NULL`),
  index("study_timer_segments_timer_idx").on(t.userId, t.timerStartedAt),
  check("study_timer_segments_order", sql`${t.lastSeenAt} >= ${t.startedAt} AND (${t.endedAt} IS NULL OR ${t.endedAt} >= ${t.startedAt})`),
]);

/**
 * Append-only competition ledger: credited time per verified session and
 * competition day. Personal edits to study_sessions never change these rows;
 * only audited corrections (score_adjustments) do.
 */
export const verifiedStudyIntervals = pgTable("verified_study_intervals", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  studySessionId: uuid("study_session_id").references(() => studySessions.id, { onDelete: "set null" }),
  /** Kept for history if the subject is later deleted. */
  subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  timerStartedAt: time("timer_started_at").notNull(),
  startedAt: time("started_at").notNull(),
  endedAt: time("ended_at").notNull(),
  /** Competition-timezone day and Monday-based week of this piece. */
  localDay: date("local_day").notNull(),
  weekStart: date("week_start").notNull(),
  creditedSeconds: integer("credited_seconds").notNull(),
  excludedSeconds: integer("excluded_seconds").notNull().default(0),
  exclusionReason: text("exclusion_reason"),
  /** counted or invalidated (by an audited correction). */
  status: text("status").$type<"counted" | "invalidated">().notNull().default("counted"),
  createdAt: created(),
}, t => [
  // Replayed or concurrent finishes cannot credit the same timer twice.
  unique("verified_study_intervals_piece").on(t.userId, t.timerStartedAt, t.startedAt),
  check("verified_study_intervals_order", sql`${t.endedAt} > ${t.startedAt}`),
  check("verified_study_intervals_seconds", sql`${t.creditedSeconds} >= 0 AND ${t.excludedSeconds} >= 0`),
  check("verified_study_intervals_status", sql`${t.status} IN ('counted', 'invalidated')`),
  index("verified_study_intervals_user_week_idx").on(t.userId, t.weekStart),
  index("verified_study_intervals_user_day_idx").on(t.userId, t.localDay),
]);

/** Incremental weekly projection of the ledger; reconcilable at any time. */
export const weeklyScores = pgTable("weekly_scores", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  creditedSeconds: integer("credited_seconds").notNull().default(0),
  sessions: integer("sessions").notNull().default(0),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.weekStart] }), index("weekly_scores_week_idx").on(t.weekStart, t.creditedSeconds), check("weekly_scores_nonnegative", sql`${t.creditedSeconds} >= 0 AND ${t.sessions} >= 0`)]);

/** A week is open until finalized; finalized results change only through audited corrections. */
export const competitionWeeks = pgTable("competition_weeks", {
  weekStart: date("week_start").primaryKey(),
  startsAt: time("starts_at").notNull(),
  endsAt: time("ends_at").notNull(),
  timezone: text("timezone").notNull(),
  finalizedAt: time("finalized_at"),
});

/** Frozen group standings (roster as of finalization). Winners are rank 1 with time > 0. */
export const groupWeekResults = pgTable("group_week_results", {
  groupId: uuid("group_id").notNull().references(() => studyGroups.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull().references(() => competitionWeeks.weekStart, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  creditedSeconds: integer("credited_seconds").notNull(),
  correctedAt: time("corrected_at"),
}, t => [primaryKey({ columns: [t.groupId, t.weekStart, t.userId] }), index("group_week_results_user_idx").on(t.userId, t.weekStart)]);

/** Every leaderboard-affecting correction, with who, why and the before/after credit. */
export const scoreAdjustments = pgTable("score_adjustments", {
  id: id(),
  intervalId: uuid("interval_id").notNull().references(() => verifiedStudyIntervals.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").$type<"invalidate" | "restore">().notNull(),
  reason: text("reason").notNull(),
  beforeSeconds: integer("before_seconds").notNull(),
  afterSeconds: integer("after_seconds").notNull(),
  createdAt: created(),
}, t => [check("score_adjustments_reason", sql`char_length(${t.reason}) BETWEEN 3 AND 500`), index("score_adjustments_interval_idx").on(t.intervalId)]);

/** Activity derived from real events; visibility is applied when it is read. */
export const socialActivities = pgTable("social_activities", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"session" | "streak" | "weeklyHours" | "groupWin" | "achievement">().notNull(),
  subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  groupId: uuid("group_id").references(() => studyGroups.id, { onDelete: "cascade" }),
  value: integer("value").notNull().default(0),
  detail: text("detail"),
  deduplicationKey: text("deduplication_key").notNull(),
  createdAt: created(),
}, t => [unique("social_activities_dedup").on(t.userId, t.deduplicationKey), index("social_activities_user_idx").on(t.userId, t.createdAt)]);

export const achievements = pgTable("achievements", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  earnedAt: time("earned_at").notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.key] })]);
