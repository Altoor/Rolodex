ALTER TABLE "appSettings" ADD COLUMN "ollamaKeepAlive" text;--> statement-breakpoint
ALTER TABLE "appSettings" ADD COLUMN "preloadModels" bool DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "appSettings" ADD COLUMN "warmModelsOnStartup" bool DEFAULT false NOT NULL;