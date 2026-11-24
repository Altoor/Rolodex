CREATE TYPE "attemptKind" AS ENUM('initial', 'revision', 'replay');--> statement-breakpoint
CREATE TYPE "attemptStatus" AS ENUM('running', 'succeeded', 'failed', 'cancelled', 'committed');--> statement-breakpoint
CREATE TYPE "runMode" AS ENUM('standard', 'assisted');--> statement-breakpoint
CREATE TYPE "runStatus" AS ENUM('running', 'awaiting_step_review', 'awaiting_decision_review', 'awaiting_user_choice', 'completed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" integer NOT NULL,
	"mode" "runMode" DEFAULT 'standard'::"runMode" NOT NULL,
	"status" "runStatus" DEFAULT 'running'::"runStatus" NOT NULL,
	"state" text NOT NULL,
	"startTaskId" integer,
	"startTaskSnapshot" json,
	"parentRunId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stepAttempts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stepAttempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"queuedTaskId" integer NOT NULL,
	"runId" uuid NOT NULL,
	"attemptNumber" integer NOT NULL,
	"kind" "attemptKind" DEFAULT 'initial'::"attemptKind" NOT NULL,
	"status" "attemptStatus" DEFAULT 'running'::"attemptStatus" NOT NULL,
	"taskSnapshot" json NOT NULL,
	"beforeState" text NOT NULL,
	"beforeToolState" json DEFAULT '[]' NOT NULL,
	"afterState" text,
	"afterToolState" json,
	"result" json,
	"effectJournal" json,
	"revision" json,
	"review" json,
	"workspaceKey" text,
	"cause" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"finishedAt" timestamp with time zone,
	"committedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "traceEvents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "traceEvents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"runId" uuid NOT NULL,
	"attemptId" integer,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "decisionBiases";--> statement-breakpoint
DROP TABLE "decisionFeedback";--> statement-breakpoint
ALTER TABLE "userSettings" RENAME COLUMN "flowAutoImprovement" TO "autoImprovement";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "isDraft" bool DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "draftOwnerId" integer;--> statement-breakpoint
-- These columns came from an abandoned migration that was never part of this
-- chain, so a fresh database may not have all of them.
ALTER TABLE "queuedTasks" DROP COLUMN IF EXISTS "nextStepApproved";--> statement-breakpoint
ALTER TABLE "queuedTasks" DROP COLUMN IF EXISTS "autoPlanned";--> statement-breakpoint
ALTER TABLE "queuedTasks" DROP COLUMN IF EXISTS "flowGoal";--> statement-breakpoint
ALTER TABLE "queuedTasks" DROP COLUMN IF EXISTS "runReview";--> statement-breakpoint
CREATE INDEX "runs_status_user_idx" ON "runs" ("status","userId");--> statement-breakpoint
CREATE INDEX "runs_mode_idx" ON "runs" ("mode");--> statement-breakpoint
CREATE UNIQUE INDEX "step_attempts_step_number_idx" ON "stepAttempts" ("queuedTaskId","attemptNumber");--> statement-breakpoint
CREATE INDEX "step_attempts_run_idx" ON "stepAttempts" ("runId");--> statement-breakpoint
CREATE INDEX "trace_events_run_sequence_idx" ON "traceEvents" ("runId","sequence");--> statement-breakpoint
CREATE INDEX "trace_events_attempt_idx" ON "traceEvents" ("attemptId");--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "stepAttempts" ADD CONSTRAINT "stepAttempts_queuedTaskId_queuedTasks_id_fkey" FOREIGN KEY ("queuedTaskId") REFERENCES "queuedTasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "stepAttempts" ADD CONSTRAINT "stepAttempts_runId_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "traceEvents" ADD CONSTRAINT "traceEvents_runId_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "traceEvents" ADD CONSTRAINT "traceEvents_attemptId_stepAttempts_id_fkey" FOREIGN KEY ("attemptId") REFERENCES "stepAttempts"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Backfill run rows for chains queued before runs existed. Without this,
-- standard rows would be invisible to the run-scoped queue views.
INSERT INTO "runs" ("id", "userId", "mode", "status", "state", "startTaskId", "createdAt", "updatedAt")
SELECT DISTINCT ON ("runId") "runId", "queued_by", 'standard', 'running', "state", "taskId", "queued_at", "queued_at"
FROM "queuedTasks"
ORDER BY "runId", "id"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "runs" r SET "status" = 'cancelled'
WHERE r."status" = 'running' AND r."mode" = 'standard' AND NOT EXISTS (
  SELECT 1 FROM "queuedTasks" q
  WHERE q."runId" = r."id" AND q."status" IN ('queued', 'running', 'awaiting_input')
) AND EXISTS (
  SELECT 1 FROM "queuedTasks" q
  WHERE q."runId" = r."id" AND q."result"->>'dismissed' = 'true'
);--> statement-breakpoint
UPDATE "runs" r SET "status" = 'failed'
WHERE r."status" = 'running' AND r."mode" = 'standard' AND NOT EXISTS (
  SELECT 1 FROM "queuedTasks" q
  WHERE q."runId" = r."id" AND q."status" IN ('queued', 'running', 'awaiting_input')
) AND EXISTS (
  SELECT 1 FROM "queuedTasks" q
  WHERE q."runId" = r."id" AND q."status" = 'failed'
    AND coalesce(q."result"->>'retried', 'false') <> 'true'
);--> statement-breakpoint
UPDATE "runs" r SET "status" = 'completed'
WHERE r."status" = 'running' AND r."mode" = 'standard' AND NOT EXISTS (
  SELECT 1 FROM "queuedTasks" q
  WHERE q."runId" = r."id" AND q."status" IN ('queued', 'running', 'awaiting_input')
);
