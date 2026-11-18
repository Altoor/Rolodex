CREATE TYPE "transcriberBackend" AS ENUM('whisper_cpp', 'faster_whisper');--> statement-breakpoint
CREATE TABLE "appSettings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"ollamaBaseUrl" text DEFAULT '' NOT NULL,
	"transcriberBackend" "transcriberBackend" DEFAULT 'faster_whisper'::"transcriberBackend" NOT NULL,
	"whisperApiUrl" text DEFAULT '' NOT NULL,
	"whisperModel" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
