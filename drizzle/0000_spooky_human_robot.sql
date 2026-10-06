CREATE TYPE "public"."resource_type" AS ENUM('file', 'link', 'video', 'note');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('learner', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."session_source" AS ENUM('timer', 'manual');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('valid', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."subject_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."topic_status" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'deactivated');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_identity_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "active_timers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_total_seconds" integer DEFAULT 0 NOT NULL,
	"confirmed_until_seconds" integer DEFAULT 21600 NOT NULL,
	"focus_goal" text,
	"needs_confirmation" boolean DEFAULT false NOT NULL,
	CONSTRAINT "timer_pause_nonnegative" CHECK ("active_timers"."paused_total_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedup_unique" UNIQUE("user_id","deduplication_key")
);
--> statement-breakpoint
CREATE TABLE "pending_object_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_object_deletions_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "pending_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"storage_key" text NOT NULL,
	"title" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_uploads_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "upload_size_nonnegative" CHECK ("pending_uploads"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"weekly_target_minutes" integer DEFAULT 0 NOT NULL,
	"theme" text DEFAULT 'auto' NOT NULL,
	"week_start_day" integer DEFAULT 1 NOT NULL,
	"reminders" boolean DEFAULT true NOT NULL,
	CONSTRAINT "preferences_goal_nonnegative" CHECK ("user_preferences"."weekly_target_minutes" >= 0),
	CONSTRAINT "preferences_week_start" CHECK ("user_preferences"."week_start_day" IN (0, 1)),
	CONSTRAINT "preferences_theme" CHECK ("user_preferences"."theme" IN ('auto', 'light', 'dark'))
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"type" "resource_type" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"storage_key" text,
	"text_content" text,
	"mime_type" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "resources_size_nonnegative" CHECK ("resources"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "schedule_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid,
	"topic_id" uuid,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"recurrence_rule" jsonb,
	"timezone" text NOT NULL,
	"note" text,
	"display_color" text DEFAULT 'brand' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "block_end_after_start" CHECK ("schedule_blocks"."ends_at" > "schedule_blocks"."starts_at"),
	CONSTRAINT "block_topic_requires_subject" CHECK ("schedule_blocks"."topic_id" IS NULL OR "schedule_blocks"."subject_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"new_starts_at" timestamp with time zone,
	"new_ends_at" timestamp with time zone,
	CONSTRAINT "schedule_exception_date_unique" UNIQUE("block_id","date"),
	CONSTRAINT "exception_end_after_start" CHECK (("schedule_exceptions"."new_starts_at" IS NULL AND "schedule_exceptions"."new_ends_at" IS NULL) OR ("schedule_exceptions"."new_starts_at" IS NOT NULL AND "schedule_exceptions"."new_ends_at" IS NOT NULL AND "schedule_exceptions"."new_ends_at" > "schedule_exceptions"."new_starts_at"))
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"status" "session_status" DEFAULT 'valid' NOT NULL,
	"note" text,
	"source" "session_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_end_after_start" CHECK ("study_sessions"."ended_at" > "study_sessions"."started_at"),
	CONSTRAINT "session_duration_nonnegative" CHECK ("study_sessions"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"display_color" text DEFAULT 'brand' NOT NULL,
	"target_date" date,
	"status" "subject_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_owner_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "topic_status" DEFAULT 'not_started' NOT NULL,
	"target_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_subject_unique" UNIQUE("id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'learner' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"learning_context" text,
	"accepted_terms_at" timestamp with time zone,
	"date_of_birth" date,
	"onboarding_completed_at" timestamp with time zone,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_subject_id_user_id_subjects_id_user_id_fk" FOREIGN KEY ("subject_id","user_id") REFERENCES "public"."subjects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_topic_id_subject_id_topics_id_subject_id_fk" FOREIGN KEY ("topic_id","subject_id") REFERENCES "public"."topics"("id","subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_subject_id_user_id_subjects_id_user_id_fk" FOREIGN KEY ("subject_id","user_id") REFERENCES "public"."subjects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_uploads" ADD CONSTRAINT "pending_uploads_topic_id_subject_id_topics_id_subject_id_fk" FOREIGN KEY ("topic_id","subject_id") REFERENCES "public"."topics"("id","subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_subject_id_user_id_subjects_id_user_id_fk" FOREIGN KEY ("subject_id","user_id") REFERENCES "public"."subjects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_topic_id_subject_id_topics_id_subject_id_fk" FOREIGN KEY ("topic_id","subject_id") REFERENCES "public"."topics"("id","subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_subject_id_user_id_subjects_id_user_id_fk" FOREIGN KEY ("subject_id","user_id") REFERENCES "public"."subjects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_topic_id_subject_id_topics_id_subject_id_fk" FOREIGN KEY ("topic_id","subject_id") REFERENCES "public"."topics"("id","subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_block_id_schedule_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."schedule_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_subject_id_user_id_subjects_id_user_id_fk" FOREIGN KEY ("subject_id","user_id") REFERENCES "public"."subjects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_topic_id_subject_id_topics_id_subject_id_fk" FOREIGN KEY ("topic_id","subject_id") REFERENCES "public"."topics"("id","subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "active_timers_subject_idx" ON "active_timers" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "active_timers_topic_idx" ON "active_timers" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pending_uploads_user_idx" ON "pending_uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resources_owner_subject_idx" ON "resources" USING btree ("user_id","subject_id");--> statement-breakpoint
CREATE INDEX "resources_topic_idx" ON "resources" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "schedule_blocks_owner_start_idx" ON "schedule_blocks" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "schedule_blocks_subject_idx" ON "schedule_blocks" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "schedule_blocks_topic_idx" ON "schedule_blocks" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "study_sessions_owner_start_idx" ON "study_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "study_sessions_subject_idx" ON "study_sessions" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "study_sessions_topic_idx" ON "study_sessions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "subjects_user_idx" ON "subjects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "topics_subject_order_idx" ON "topics" USING btree ("subject_id","sort_order");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");