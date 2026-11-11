CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "todos" RENAME COLUMN "content" TO "description";--> statement-breakpoint
ALTER TABLE "queuedTasks" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "toolKey" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "toolConfig" json;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "descriptionEmbedding" vector(768);--> statement-breakpoint
CREATE INDEX "todos_description_embedding_idx" ON "todos" USING hnsw ("descriptionEmbedding" vector_cosine_ops);