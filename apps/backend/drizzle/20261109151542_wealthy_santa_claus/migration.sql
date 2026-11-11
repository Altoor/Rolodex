CREATE TYPE "ToolOutputType" AS ENUM('normal', 'foreach');--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "toolState" json DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "parentQueuedTaskId" integer;--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "toolOutputType" "ToolOutputType" DEFAULT 'normal'::"ToolOutputType" NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "onTrueTaskId" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "onFalseTaskId" integer;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "archived_at" timestamp with time zone;