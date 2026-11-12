CREATE TYPE "userDecisionOptionKind" AS ENUM('static', 'dynamic');--> statement-breakpoint
CREATE TYPE "userDecisionType" AS ENUM('yesNo', 'list', 'dropdown');--> statement-breakpoint
ALTER TYPE "TaskType" ADD VALUE 'userDecision';--> statement-breakpoint
ALTER TYPE "queuedTaskStatus" ADD VALUE 'awaiting_input' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "userDecisionOptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "userDecisionOptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"taskId" integer NOT NULL,
	"kind" "userDecisionOptionKind" DEFAULT 'static'::"userDecisionOptionKind" NOT NULL,
	"label" text,
	"description" text,
	"value" text,
	"selector" json,
	"labelPath" text,
	"descriptionPath" text,
	"valuePath" text,
	"resultTaskId" integer,
	"appendState" bool DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "pendingChoice" json;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "forceUserDecide" bool DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "userDecisionType" "userDecisionType" DEFAULT 'list'::"userDecisionType" NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "userDecisionConfig" json;