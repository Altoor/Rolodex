CREATE TYPE "fileEntryKind" AS ENUM('file', 'folder');--> statement-breakpoint
CREATE TYPE "fileType" AS ENUM('image', 'text', 'plaintext', 'audio', 'video', 'other');--> statement-breakpoint
CREATE TABLE "fileEntries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fileEntries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"parentId" integer,
	"kind" "fileEntryKind" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"relativePath" text NOT NULL,
	"fileType" "fileType",
	"mimeType" text,
	"size" bigint,
	"contentHash" text,
	"filesystemModifiedAt" timestamp with time zone,
	"lastEditedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"deletedAt" timestamp with time zone,
	"embedding" vector(768)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "file_entries_path_live_idx" ON "fileEntries" ("relativePath") WHERE "deletedAt" IS NULL;--> statement-breakpoint
CREATE INDEX "file_entries_parent_idx" ON "fileEntries" ("parentId");--> statement-breakpoint
CREATE INDEX "file_entries_embedding_idx" ON "fileEntries" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "fileEntries" ADD CONSTRAINT "fileEntries_parentId_fileEntries_id_fkey" FOREIGN KEY ("parentId") REFERENCES "fileEntries"("id") ON DELETE SET NULL;