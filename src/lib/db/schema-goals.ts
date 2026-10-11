import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  jsonb,
  timestamp,
  boolean,
  index,
  unique,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { users, subjects, topics, resources, studySessions } from "./schema";
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
export const goals = pgTable(
  "goals",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    customCategory: text("custom_category").notNull().default(""),
    startDate: date("start_date").notNull(),
    targetDate: date("target_date").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("active"),
    motivation: text("motivation").notNull().default(""),
    successCriteria: text("success_criteria").notNull().default(""),
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
    progressMode: text("progress_mode").notNull().default("tasks"),
    progressConfig: jsonb("progress_config")
      .$type<import("@/lib/goals/validation").GoalInput["progressConfig"]>()
      .notNull(),
    reminders: boolean("reminders").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("goals_owner_status_target_idx").on(t.userId, t.status, t.targetDate),
    unique("goals_owner_unique").on(t.id, t.userId),
    check("goals_dates", sql`${t.targetDate} >= ${t.startDate}`),
    check("goals_version_positive", sql`${t.version} > 0`),
  ],
);
export const goalMilestones = pgTable(
  "goal_milestones",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    dueDate: date("due_date"),
    weight: integer("weight").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    dependencyIds: jsonb("dependency_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("goal_milestones_goal_idx").on(t.goalId),
    unique("goal_milestones_goal_unique").on(t.id, t.goalId),
    check("milestone_weight_positive", sql`${t.weight} > 0`),
  ],
);
export const goalTasks = pgTable(
  "goal_tasks",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("normal"),
    dueDate: date("due_date"),
    estimatedMinutes: integer("estimated_minutes").notNull().default(30),
    weight: integer("weight").notNull().default(1),
    subjectId: uuid("subject_id").references(() => subjects.id, {
      onDelete: "set null",
    }),
    topicId: uuid("topic_id").references(() => topics.id, {
      onDelete: "set null",
    }),
    recurringDays: jsonb("recurring_days")
      .$type<number[]>()
      .notNull()
      .default([]),
    evidence: text("evidence").notNull().default(""),
    progressMode: text("progress_mode").notNull().default("manual"),
    manualProgress: integer("manual_progress").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("goal_tasks_goal_status_due_idx").on(t.goalId, t.status, t.dueDate),
    unique("goal_tasks_goal_unique").on(t.id, t.goalId),
    foreignKey({
      columns: [t.milestoneId, t.goalId],
      foreignColumns: [goalMilestones.id, goalMilestones.goalId],
    }).onDelete("cascade"),
    check("task_weight_positive", sql`${t.weight} > 0`),
    check("task_progress_range", sql`${t.manualProgress} BETWEEN 0 AND 100`),
  ],
);
export const goalTaskDependencies = pgTable(
  "goal_task_dependencies",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    prerequisiteId: uuid("prerequisite_id").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.taskId, t.goalId],
      foreignColumns: [goalTasks.id, goalTasks.goalId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.prerequisiteId, t.goalId],
      foreignColumns: [goalTasks.id, goalTasks.goalId],
    }).onDelete("cascade"),
    unique("task_dependency_unique").on(t.taskId, t.prerequisiteId),
    check("task_not_self_dependent", sql`${t.taskId} <> ${t.prerequisiteId}`),
  ],
);
export const goalLinks = pgTable(
  "goal_links",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => subjects.id, {
      onDelete: "cascade",
    }),
    topicId: uuid("topic_id").references(() => topics.id, {
      onDelete: "cascade",
    }),
    resourceId: uuid("resource_id").references(() => resources.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    index("goal_links_goal_idx").on(t.goalId),
    check(
      "goal_link_one_reference",
      sql`num_nonnulls(${t.subjectId}, ${t.topicId}, ${t.resourceId}) = 1`,
    ),
  ],
);
export const goalActivity = pgTable(
  "goal_activity",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => goalTasks.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    amount: integer("amount").notNull().default(0),
    evidence: text("evidence").notNull(),
    date: date("date").notNull(),
    deduplicationKey: text("deduplication_key"),
    createdAt: created(),
  },
  (t) => [
    index("goal_activity_goal_date_idx").on(t.goalId, t.date),
    unique("goal_activity_dedup_unique").on(t.goalId, t.deduplicationKey),
    check("goal_activity_amount_nonnegative", sql`${t.amount} >= 0`),
  ],
);
export const goalStudySessionLinks = pgTable(
  "goal_study_session_links",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => goalTasks.id, {
      onDelete: "set null",
    }),
    allocatedSeconds: integer("allocated_seconds").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("goal_session_unique").on(t.goalId, t.sessionId),
    index("goal_session_session_idx").on(t.sessionId),
    check("goal_session_seconds_positive", sql`${t.allocatedSeconds} > 0`),
  ],
);
export const goalHistory = pgTable(
  "goal_history",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    targetId: text("target_id").notNull(),
    version: integer("version").notNull(),
    createdAt: created(),
  },
  (t) => [index("goal_history_goal_idx").on(t.goalId, t.createdAt)],
);
export const goalProgressSnapshots = pgTable(
  "goal_progress_snapshots",
  {
    id: id(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    progress: integer("progress").notNull(),
    health: text("health").notNull(),
  },
  (t) => [unique("goal_snapshot_day_unique").on(t.goalId, t.date)],
);
export const goalMutations = pgTable(
  "goal_mutations",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").notNull(),
    version: integer("version").notNull(),
    createdAt: created(),
  },
  (t) => [index("goal_mutations_owner_idx").on(t.userId)],
);
