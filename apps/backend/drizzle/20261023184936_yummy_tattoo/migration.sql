ALTER TABLE "decisions" ADD COLUMN "decisionPremise" text NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" DROP COLUMN "decisionType";