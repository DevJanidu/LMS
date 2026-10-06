ALTER TABLE "schedule_exceptions" ADD COLUMN "new_title" text;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD COLUMN "new_note" text;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD COLUMN "new_color" text;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD COLUMN "new_subject_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD COLUMN "new_topic_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_new_subject_id_subjects_id_fk" FOREIGN KEY ("new_subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_new_topic_id_new_subject_id_topics_id_subject_id_fk" FOREIGN KEY ("new_topic_id","new_subject_id") REFERENCES "public"."topics"("id","subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "exception_topic_requires_subject" CHECK ("schedule_exceptions"."new_topic_id" IS NULL OR "schedule_exceptions"."new_subject_id" IS NOT NULL);