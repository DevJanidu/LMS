CREATE TABLE "schedule_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"date" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"attended_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"session_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_attendance_occurrence_unique" UNIQUE("user_id","block_id","date"),
	CONSTRAINT "schedule_attendance_status" CHECK ("schedule_attendance"."status" IN ('attended','completed','skipped'))
);
--> statement-breakpoint
ALTER TABLE "active_timers" ADD COLUMN "attendance_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_attendance" ADD CONSTRAINT "schedule_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_attendance" ADD CONSTRAINT "schedule_attendance_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_owner_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "schedule_attendance" ADD CONSTRAINT "schedule_attendance_block_id_user_id_schedule_blocks_id_user_id_fk" FOREIGN KEY ("block_id","user_id") REFERENCES "public"."schedule_blocks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_attendance_user_start_idx" ON "schedule_attendance" USING btree ("user_id","starts_at");--> statement-breakpoint
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_attendance_id_schedule_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."schedule_attendance"("id") ON DELETE set null ON UPDATE no action;
