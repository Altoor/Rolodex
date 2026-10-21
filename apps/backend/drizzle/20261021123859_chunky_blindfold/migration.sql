CREATE TYPE "types" AS ENUM('choice', 'noul', 'score');--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"type" "types" DEFAULT 'choice'::"types",
	"decisionType" text NOT NULL,
	"instruction" text NOT NULL,
	"state" text NOT NULL,
	"options" text[],
	"optionDescriptions" text[]
);
