ALTER TABLE "queued_task" RENAME TO "queuedTask";--> statement-breakpoint
ALTER TABLE "taskResults" ALTER COLUMN "scoreThreshold" SET DATA TYPE real USING "scoreThreshold"::real;--> statement-breakpoint
ALTER TABLE "taskResults" ALTER COLUMN "probabilityThreshold" SET DATA TYPE real USING "probabilityThreshold"::real;--> statement-breakpoint
ALTER TABLE "taskResults" ALTER COLUMN "confidenceThreshold" SET DATA TYPE real USING "confidenceThreshold"::real;