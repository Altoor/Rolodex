CREATE TABLE "userSettings" (
	"userId" integer PRIMARY KEY,
	"defaultTaskId" integer,
	"defaultModelName" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_defaultTaskId_tasks_id_fkey" FOREIGN KEY ("defaultTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_defaultModelName_models_name_fkey" FOREIGN KEY ("defaultModelName") REFERENCES "models"("name") ON DELETE SET NULL;