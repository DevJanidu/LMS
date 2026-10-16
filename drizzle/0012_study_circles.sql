CREATE TABLE "achievements" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "competition_weeks" (
	"week_start" date PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "friend_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"masked_email" text NOT NULL,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_invitations_sender_email" UNIQUE("sender_id","email_hash")
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friend_requests_not_self" CHECK ("friend_requests"."sender_id" <> "friend_requests"."recipient_id"),
	CONSTRAINT "friend_requests_status" CHECK ("friend_requests"."status" IN ('pending', 'accepted', 'declined', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_low" uuid NOT NULL,
	"user_high" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_low_user_high_pk" PRIMARY KEY("user_low","user_high"),
	CONSTRAINT "friendships_ordered" CHECK ("friendships"."user_low" < "friendships"."user_high")
);
--> statement-breakpoint
CREATE TABLE "group_week_results" (
	"group_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"user_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"credited_seconds" integer NOT NULL,
	"corrected_at" timestamp with time zone,
	CONSTRAINT "group_week_results_group_id_week_start_user_id_pk" PRIMARY KEY("group_id","week_start","user_id")
);
--> statement-breakpoint
CREATE TABLE "score_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interval_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"before_seconds" integer NOT NULL,
	"after_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_adjustments_reason" CHECK (char_length("score_adjustments"."reason") BETWEEN 3 AND 500)
);
--> statement-breakpoint
CREATE TABLE "social_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid,
	"group_id" uuid,
	"value" integer DEFAULT 0 NOT NULL,
	"detail" text,
	"deduplication_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_activities_dedup" UNIQUE("user_id","deduplication_key")
);
--> statement-breakpoint
CREATE TABLE "social_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"accept_requests" boolean DEFAULT true NOT NULL,
	"activity_visibility" text DEFAULT 'friends' NOT NULL,
	"share_subjects" boolean DEFAULT false NOT NULL,
	"share_streak" boolean DEFAULT true NOT NULL,
	"show_on_leaderboards" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_profiles_visibility" CHECK ("social_profiles"."activity_visibility" IN ('private', 'friends', 'groups'))
);
--> statement-breakpoint
CREATE TABLE "study_group_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"inviter_id" uuid NOT NULL,
	"invitee_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "study_group_invitations_status" CHECK ("study_group_invitations"."status" IN ('pending', 'accepted', 'declined', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "study_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
	CONSTRAINT "study_group_members_role" CHECK ("study_group_members"."role" IN ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "study_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'brand' NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_groups_name_length" CHECK (char_length("study_groups"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "study_timer_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"timer_started_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "study_timer_segments_order" CHECK ("study_timer_segments"."last_seen_at" >= "study_timer_segments"."started_at" AND ("study_timer_segments"."ended_at" IS NULL OR "study_timer_segments"."ended_at" >= "study_timer_segments"."started_at"))
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_not_self" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "verified_study_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"study_session_id" uuid,
	"subject_id" uuid,
	"timer_started_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"local_day" date NOT NULL,
	"week_start" date NOT NULL,
	"credited_seconds" integer NOT NULL,
	"excluded_seconds" integer DEFAULT 0 NOT NULL,
	"exclusion_reason" text,
	"status" text DEFAULT 'counted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verified_study_intervals_piece" UNIQUE("user_id","timer_started_at","started_at"),
	CONSTRAINT "verified_study_intervals_order" CHECK ("verified_study_intervals"."ended_at" > "verified_study_intervals"."started_at"),
	CONSTRAINT "verified_study_intervals_seconds" CHECK ("verified_study_intervals"."credited_seconds" >= 0 AND "verified_study_intervals"."excluded_seconds" >= 0),
	CONSTRAINT "verified_study_intervals_status" CHECK ("verified_study_intervals"."status" IN ('counted', 'invalidated'))
);
--> statement-breakpoint
CREATE TABLE "weekly_scores" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"credited_seconds" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_scores_user_id_week_start_pk" PRIMARY KEY("user_id","week_start"),
	CONSTRAINT "weekly_scores_nonnegative" CHECK ("weekly_scores"."credited_seconds" >= 0 AND "weekly_scores"."sessions" >= 0)
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_invitations" ADD CONSTRAINT "friend_invitations_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_invitations" ADD CONSTRAINT "friend_invitations_request_id_friend_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."friend_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_low_users_id_fk" FOREIGN KEY ("user_low") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_high_users_id_fk" FOREIGN KEY ("user_high") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_week_results" ADD CONSTRAINT "group_week_results_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_week_results" ADD CONSTRAINT "group_week_results_week_start_competition_weeks_week_start_fk" FOREIGN KEY ("week_start") REFERENCES "public"."competition_weeks"("week_start") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_week_results" ADD CONSTRAINT "group_week_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_interval_id_verified_study_intervals_id_fk" FOREIGN KEY ("interval_id") REFERENCES "public"."verified_study_intervals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_invitations" ADD CONSTRAINT "study_group_invitations_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_invitations" ADD CONSTRAINT "study_group_invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_invitations" ADD CONSTRAINT "study_group_invitations_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group_members" ADD CONSTRAINT "study_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_timer_segments" ADD CONSTRAINT "study_timer_segments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_study_intervals" ADD CONSTRAINT "verified_study_intervals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_study_intervals" ADD CONSTRAINT "verified_study_intervals_study_session_id_study_sessions_id_fk" FOREIGN KEY ("study_session_id") REFERENCES "public"."study_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_study_intervals" ADD CONSTRAINT "verified_study_intervals_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_scores" ADD CONSTRAINT "weekly_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_invitations_sender_idx" ON "friend_invitations" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_one_pending" ON "friend_requests" USING btree (least("sender_id", "recipient_id"),greatest("sender_id", "recipient_id")) WHERE "friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "friend_requests_recipient_idx" ON "friend_requests" USING btree ("recipient_id","status");--> statement-breakpoint
CREATE INDEX "friend_requests_sender_idx" ON "friend_requests" USING btree ("sender_id","status");--> statement-breakpoint
CREATE INDEX "friendships_high_idx" ON "friendships" USING btree ("user_high");--> statement-breakpoint
CREATE INDEX "group_week_results_user_idx" ON "group_week_results" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "score_adjustments_interval_idx" ON "score_adjustments" USING btree ("interval_id");--> statement-breakpoint
CREATE INDEX "social_activities_user_idx" ON "social_activities" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "study_group_invitations_one_pending" ON "study_group_invitations" USING btree ("group_id","invitee_id") WHERE "study_group_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "study_group_invitations_invitee_idx" ON "study_group_invitations" USING btree ("invitee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "study_group_members_one_owner" ON "study_group_members" USING btree ("group_id") WHERE "study_group_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "study_group_members_user_idx" ON "study_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_groups_owner_idx" ON "study_groups" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_timer_segments_one_open" ON "study_timer_segments" USING btree ("user_id") WHERE "study_timer_segments"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "study_timer_segments_timer_idx" ON "study_timer_segments" USING btree ("user_id","timer_started_at");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "verified_study_intervals_user_week_idx" ON "verified_study_intervals" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "verified_study_intervals_user_day_idx" ON "verified_study_intervals" USING btree ("user_id","local_day");--> statement-breakpoint
CREATE INDEX "weekly_scores_week_idx" ON "weekly_scores" USING btree ("week_start","credited_seconds");--> statement-breakpoint
-- Backstop: no instant of counted, credited time may belong to two ledger pieces of the same user.
-- The application subtracts already-credited time first, so this never fires in normal use.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "verified_study_intervals" ADD CONSTRAINT "verified_study_intervals_no_overlap" EXCLUDE USING gist ("user_id" WITH =, tstzrange("started_at", "ended_at", '[)') WITH &&) WHERE ("status" = 'counted' AND "credited_seconds" > 0);
