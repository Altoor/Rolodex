ALTER TABLE "queuedTasks" ADD COLUMN "autoPlanned" bool DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "flowGoal" text;--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "runReview" json;