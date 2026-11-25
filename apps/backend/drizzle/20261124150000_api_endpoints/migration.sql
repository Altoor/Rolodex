CREATE TABLE "apiEndpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" integer NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "slug" text NOT NULL,
  "taskId" integer NOT NULL,
  "keyHash" text NOT NULL,
  "keyPrefix" text NOT NULL,
  "keyLastFour" text NOT NULL,
  "stateField" text,
  "enabled" bool DEFAULT true NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "apiEndpoints_slug_unique" UNIQUE ("slug")
);
--> statement-breakpoint
CREATE TABLE "apiRequests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "endpointId" uuid NOT NULL,
  "userId" integer NOT NULL,
  "runId" uuid NOT NULL,
  "state" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "apiRequests_runId_unique" UNIQUE ("runId")
);
--> statement-breakpoint
CREATE INDEX "api_endpoints_user_idx" ON "apiEndpoints" ("userId");--> statement-breakpoint
CREATE INDEX "api_requests_endpoint_idx" ON "apiRequests" ("endpointId");--> statement-breakpoint
CREATE INDEX "api_requests_user_idx" ON "apiRequests" ("userId");--> statement-breakpoint
ALTER TABLE "apiEndpoints" ADD CONSTRAINT "apiEndpoints_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apiEndpoints" ADD CONSTRAINT "apiEndpoints_taskId_tasks_id_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apiRequests" ADD CONSTRAINT "apiRequests_endpointId_apiEndpoints_id_fkey" FOREIGN KEY ("endpointId") REFERENCES "apiEndpoints"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apiRequests" ADD CONSTRAINT "apiRequests_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apiRequests" ADD CONSTRAINT "apiRequests_runId_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE;
