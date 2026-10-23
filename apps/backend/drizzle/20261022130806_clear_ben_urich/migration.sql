CREATE TYPE "types" AS ENUM('choice', 'noul', 'score');--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"type" "types" DEFAULT 'choice'::"types" NOT NULL,
	"decisionType" text NOT NULL,
	"instruction" text NOT NULL,
	"options" text[],
	"optionDescriptions" text[],
	"authorId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "todos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"content" text NOT NULL,
	"done" bool DEFAULT false NOT NULL,
	"author_id" integer NOT NULL,
	"actor_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"hashedPassword" text NOT NULL
);
