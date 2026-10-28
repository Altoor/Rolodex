CREATE TYPE "taskType" AS ENUM('decision', 'textPrompt', 'tool');--> statement-breakpoint
ALTER TYPE "type" RENAME TO "decisionType";--> statement-breakpoint
CREATE TABLE "queued_task" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "queued_task_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"taskId" integer NOT NULL,
	"completed" bool DEFAULT false NOT NULL,
	"queued_at" date NOT NULL,
	"queued_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "task_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"type" "taskType" DEFAULT 'decision'::"taskType" NOT NULL,
	"decisionId" integer
);
--> statement-breakpoint
CREATE TABLE "taskResults" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "taskResults_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"taskId" integer NOT NULL,
	"type" "decisionType" DEFAULT 'choice'::"decisionType" NOT NULL,
	"option" text,
	"scoreThreshold" text,
	"probabilityThreshold" text,
	"confidenceThreshold" text NOT NULL,
	"resultTaskId" integer NOT NULL
);
