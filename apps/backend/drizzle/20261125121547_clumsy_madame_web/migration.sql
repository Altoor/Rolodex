CREATE TABLE "standardApiKeys" (
	"userId" integer PRIMARY KEY,
	"keyHash" text NOT NULL UNIQUE,
	"keyPrefix" text NOT NULL,
	"keyLastFour" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "standardApiKeys" ADD CONSTRAINT "standardApiKeys_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;