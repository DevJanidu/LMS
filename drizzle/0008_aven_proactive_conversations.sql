ALTER TABLE "ai_conversations" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_source_unique" UNIQUE("user_id","source_key");