CREATE TYPE "modelType" AS ENUM('systemOne', 'systemTwo', 'embedding');--> statement-breakpoint
ALTER TYPE "types" RENAME TO "type";--> statement-breakpoint
CREATE TABLE "models" (
	"name" text PRIMARY KEY UNIQUE,
	"description" text,
	"type" "modelType",
	"pulled" bool DEFAULT false NOT NULL,
	"modified_at" date,
	"model" text NOT NULL,
	"size" bigint,
	"digest" text,
	"details" json,
	"expires_at" date,
	"size_vram" bigint
);
