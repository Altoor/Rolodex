ALTER TABLE "models" ADD COLUMN "capabilities" text[];--> statement-breakpoint
ALTER TABLE "models" DROP COLUMN "type";--> statement-breakpoint
DROP TYPE "modelType";