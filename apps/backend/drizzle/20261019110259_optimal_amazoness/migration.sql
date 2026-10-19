ALTER TABLE "posts" RENAME TO "todos";--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "actor_id" integer NOT NULL;