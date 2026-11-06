ALTER TABLE "queuedTasks" ADD COLUMN "decisionModel" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "decisionModel" text;--> statement-breakpoint
ALTER TABLE "userSettings" ADD COLUMN "defaultDecisionModelName" text;--> statement-breakpoint
ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_defaultDecisionModelName_models_name_fkey" FOREIGN KEY ("defaultDecisionModelName") REFERENCES "models"("name") ON DELETE SET NULL;