CREATE TYPE "queuedTaskStatus" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "queuedTasks" RENAME COLUMN "completed" TO "status";--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "runId" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "result" json;--> statement-breakpoint
ALTER TABLE "taskResults" ADD COLUMN "appendState" bool DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "queuedTasks" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "queuedTasks" ALTER COLUMN "status" SET DATA TYPE "queuedTaskStatus" USING "status"::"queuedTaskStatus";--> statement-breakpoint
ALTER TABLE "queuedTasks" ALTER COLUMN "status" SET DEFAULT 'queued'::"queuedTaskStatus";--> statement-breakpoint
ALTER TABLE "queuedTasks" ALTER COLUMN "queued_at" SET DATA TYPE timestamp with time zone USING "queued_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queuedTasks" ALTER COLUMN "queued_at" SET DEFAULT now();