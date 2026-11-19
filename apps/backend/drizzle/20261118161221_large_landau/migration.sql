CREATE TABLE "decisionBiases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "decisionBiases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"decisionId" integer NOT NULL,
	"option" text NOT NULL,
	"bias" real DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisionFeedback" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "decisionFeedback_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"queuedTaskId" integer NOT NULL UNIQUE,
	"taskId" integer NOT NULL,
	"decisionId" integer NOT NULL,
	"runId" uuid NOT NULL,
	"predictedResultId" integer,
	"actualResultId" integer,
	"correct" bool NOT NULL,
	"appliedDeltas" json DEFAULT '[]' NOT NULL,
	"reviewedBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "userSettings" ADD COLUMN "flowAutoImprovement" bool DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_biases_decision_option_idx" ON "decisionBiases" ("decisionId","option");--> statement-breakpoint
CREATE INDEX "decision_feedback_decision_idx" ON "decisionFeedback" ("decisionId");--> statement-breakpoint
CREATE INDEX "decision_feedback_run_idx" ON "decisionFeedback" ("runId");--> statement-breakpoint
ALTER TABLE "decisionBiases" ADD CONSTRAINT "decisionBiases_decisionId_decisions_id_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "decisionFeedback" ADD CONSTRAINT "decisionFeedback_decisionId_decisions_id_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE CASCADE;