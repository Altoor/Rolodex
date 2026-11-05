ALTER TABLE "task" RENAME TO "tasks";--> statement-breakpoint
ALTER TABLE "queued_task" ADD COLUMN "state" text NOT NULL;