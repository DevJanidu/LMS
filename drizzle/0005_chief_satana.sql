CREATE TABLE "calendar_mutations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD COLUMN "overrides" jsonb;--> statement-breakpoint
ALTER TABLE "calendar_mutations" ADD CONSTRAINT "calendar_mutations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_mutations_created_idx" ON "calendar_mutations" USING btree ("created_at");