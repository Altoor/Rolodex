ALTER TYPE "queuedTaskStatus" ADD VALUE 'waiting' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "forkGroupId" uuid;--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "forkIndex" integer;--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "isJoin" bool DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "joinTaskId" integer;--> statement-breakpoint
CREATE INDEX "queued_tasks_fork_group_idx" ON "queuedTasks" ("forkGroupId");