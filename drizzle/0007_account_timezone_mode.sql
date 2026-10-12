ALTER TABLE "users" ADD COLUMN "timezone_mode" text DEFAULT 'device' NOT NULL;
--> statement-breakpoint
UPDATE "users" SET "timezone_mode" = 'manual' WHERE "timezone" <> 'UTC';
