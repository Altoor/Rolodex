ALTER TABLE "decisions" ADD COLUMN "authorId" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" DROP COLUMN "state";