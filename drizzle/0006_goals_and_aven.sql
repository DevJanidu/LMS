CREATE TABLE "goal_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"task_id" uuid,
	"type" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"evidence" text NOT NULL,
	"date" date NOT NULL,
	"deduplication_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_activity_dedup_unique" UNIQUE("goal_id","deduplication_key"),
	CONSTRAINT "goal_activity_amount_nonnegative" CHECK ("goal_activity"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "goal_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"subject_id" uuid,
	"topic_id" uuid,
	"resource_id" uuid,
	CONSTRAINT "goal_link_one_reference" CHECK (num_nonnulls("goal_links"."subject_id", "goal_links"."topic_id", "goal_links"."resource_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "goal_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"due_date" date,
	"weight" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"dependency_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_milestones_goal_unique" UNIQUE("id","goal_id"),
	CONSTRAINT "milestone_weight_positive" CHECK ("goal_milestones"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "goal_mutations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_progress_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"progress" integer NOT NULL,
	"health" text NOT NULL,
	CONSTRAINT "goal_snapshot_day_unique" UNIQUE("goal_id","date")
);
--> statement-breakpoint
CREATE TABLE "goal_study_session_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"task_id" uuid,
	"allocated_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_session_unique" UNIQUE("goal_id","session_id"),
	CONSTRAINT "goal_session_seconds_positive" CHECK ("goal_study_session_links"."allocated_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "goal_task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"prerequisite_id" uuid NOT NULL,
	CONSTRAINT "task_dependency_unique" UNIQUE("task_id","prerequisite_id"),
	CONSTRAINT "task_not_self_dependent" CHECK ("goal_task_dependencies"."task_id" <> "goal_task_dependencies"."prerequisite_id")
);
--> statement-breakpoint
CREATE TABLE "goal_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"milestone_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_date" date,
	"estimated_minutes" integer DEFAULT 30 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"subject_id" uuid,
	"topic_id" uuid,
	"recurring_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"progress_mode" text DEFAULT 'manual' NOT NULL,
	"manual_progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_tasks_goal_unique" UNIQUE("id","goal_id"),
	CONSTRAINT "task_weight_positive" CHECK ("goal_tasks"."weight" > 0),
	CONSTRAINT "task_progress_range" CHECK ("goal_tasks"."manual_progress" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"custom_category" text DEFAULT '' NOT NULL,
	"start_date" date NOT NULL,
	"target_date" date NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"motivation" text DEFAULT '' NOT NULL,
	"success_criteria" text DEFAULT '' NOT NULL,
	"estimated_minutes" integer DEFAULT 0 NOT NULL,
	"progress_mode" text DEFAULT 'tasks' NOT NULL,
	"progress_config" jsonb NOT NULL,
	"reminders" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_owner_unique" UNIQUE("id","user_id"),
	CONSTRAINT "goals_dates" CHECK ("goals"."target_date" >= "goals"."start_date"),
	CONSTRAINT "goals_version_positive" CHECK ("goals"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"summary_message_count" integer DEFAULT 0 NOT NULL,
	"active_request_id" uuid,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_conversations_owner_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ai_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_memory_source" CHECK ("ai_memory"."source" IN ('user','suggestion'))
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_message_request_role_unique" UNIQUE("conversation_id","request_id","role"),
	CONSTRAINT "ai_message_role" CHECK ("ai_messages"."role" IN ('user','assistant'))
);
--> statement-breakpoint
CREATE TABLE "ai_plan_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"value" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_tool_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_approval_proposal_unique" UNIQUE("proposal_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"model" text NOT NULL,
	"day" date NOT NULL,
	"reserved_tokens" integer NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_request_unique" UNIQUE("user_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "ai_user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_schedule_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"task_id" uuid,
	"block_id" uuid NOT NULL,
	CONSTRAINT "goal_schedule_block_unique" UNIQUE("goal_id","block_id")
);
--> statement-breakpoint
CREATE TABLE "notification_actions" (
	"notification_id" uuid PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_delivery_channel_unique" UNIQUE("notification_id","channel")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "scheduled_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"value" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_checkin_dedup_unique" UNIQUE("user_id","deduplication_key")
);
--> statement-breakpoint
ALTER TABLE "goal_activity" ADD CONSTRAINT "goal_activity_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_activity" ADD CONSTRAINT "goal_activity_task_id_goal_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."goal_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_history" ADD CONSTRAINT "goal_history_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_links" ADD CONSTRAINT "goal_links_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_mutations" ADD CONSTRAINT "goal_mutations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress_snapshots" ADD CONSTRAINT "goal_progress_snapshots_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_study_session_links" ADD CONSTRAINT "goal_study_session_links_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_study_session_links" ADD CONSTRAINT "goal_study_session_links_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_study_session_links" ADD CONSTRAINT "goal_study_session_links_task_id_goal_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."goal_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_task_dependencies" ADD CONSTRAINT "goal_task_dependencies_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_task_dependencies" ADD CONSTRAINT "goal_task_dependencies_task_id_goal_id_goal_tasks_id_goal_id_fk" FOREIGN KEY ("task_id","goal_id") REFERENCES "public"."goal_tasks"("id","goal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_task_dependencies" ADD CONSTRAINT "goal_task_dependencies_prerequisite_id_goal_id_goal_tasks_id_goal_id_fk" FOREIGN KEY ("prerequisite_id","goal_id") REFERENCES "public"."goal_tasks"("id","goal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tasks" ADD CONSTRAINT "goal_tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tasks" ADD CONSTRAINT "goal_tasks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tasks" ADD CONSTRAINT "goal_tasks_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_tasks" ADD CONSTRAINT "goal_tasks_milestone_id_goal_id_goal_milestones_id_goal_id_fk" FOREIGN KEY ("milestone_id","goal_id") REFERENCES "public"."goal_milestones"("id","goal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_goal_id_user_id_goals_id_user_id_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_proposals" ADD CONSTRAINT "ai_plan_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_plan_proposals" ADD CONSTRAINT "ai_plan_proposals_conversation_id_user_id_ai_conversations_id_user_id_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."ai_conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_approvals" ADD CONSTRAINT "ai_tool_approvals_proposal_id_ai_plan_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."ai_plan_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_approvals" ADD CONSTRAINT "ai_tool_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_user_preferences" ADD CONSTRAINT "ai_user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_schedule_links" ADD CONSTRAINT "goal_schedule_links_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_schedule_links" ADD CONSTRAINT "goal_schedule_links_task_id_goal_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."goal_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_schedule_links" ADD CONSTRAINT "goal_schedule_links_block_id_schedule_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."schedule_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_actions" ADD CONSTRAINT "notification_actions_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_check_ins" ADD CONSTRAINT "scheduled_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_activity_goal_date_idx" ON "goal_activity" USING btree ("goal_id","date");--> statement-breakpoint
CREATE INDEX "goal_history_goal_idx" ON "goal_history" USING btree ("goal_id","created_at");--> statement-breakpoint
CREATE INDEX "goal_links_goal_idx" ON "goal_links" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_milestones_goal_idx" ON "goal_milestones" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "goal_mutations_owner_idx" ON "goal_mutations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_session_session_idx" ON "goal_study_session_links" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "goal_tasks_goal_status_due_idx" ON "goal_tasks" USING btree ("goal_id","status","due_date");--> statement-breakpoint
CREATE INDEX "goals_owner_status_target_idx" ON "goals" USING btree ("user_id","status","target_date");--> statement-breakpoint
CREATE INDEX "ai_conversations_owner_idx" ON "ai_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_memory_owner_idx" ON "ai_memory" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_proposals_owner_status_idx" ON "ai_plan_proposals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "ai_usage_owner_day_idx" ON "ai_usage_records" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "notification_delivery_due_idx" ON "notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_preferences_check_idx" ON "notification_preferences" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_owner_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_checkin_due_idx" ON "scheduled_check_ins" USING btree ("status","due_at");