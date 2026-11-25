import { and, eq } from "drizzle-orm";
import {
  apiEndpoints,
  apiRequests,
  db,
  queuedTasks,
  runs,
  standardApiKeys,
} from "@repo/db";
import type { CreatedApiEndpoint, CreatedStandardApiKey } from "@repo/api";
import { builder } from "../builder";
import { Task } from "../task/task/task";

export type ApiEndpointRow = typeof apiEndpoints.$inferSelect;
export type ApiRequestRow = typeof apiRequests.$inferSelect;
export type StandardApiKeyRow = typeof standardApiKeys.$inferSelect;

export const ApiRequestStatus = builder.enumType("ApiRequestStatus", {
  values: ["running", "awaiting_input", "completed", "failed", "cancelled"],
});

export const ApiEndpoint = builder
  .objectRef<ApiEndpointRow>("ApiEndpoint")
  .implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      name: t.exposeString("name"),
      description: t.exposeString("description"),
      slug: t.exposeString("slug"),
      taskId: t.exposeInt("taskId"),
      keyPrefix: t.exposeString("keyPrefix"),
      keyLastFour: t.exposeString("keyLastFour"),
      stateField: t.exposeString("stateField", { nullable: true }),
      enabled: t.exposeBoolean("enabled"),
      createdAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.createdAt,
      }),
      updatedAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.updatedAt,
      }),
      task: t.field({
        type: Task,
        resolve: (parent) =>
          db.query.tasks.findFirst({
            where: { id: parent.taskId },
          }),
      }),
    }),
  });

export const ApiRequest = builder
  .objectRef<ApiRequestRow>("ApiRequest")
  .implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      endpointId: t.exposeString("endpointId"),
      runId: t.exposeString("runId"),
      state: t.exposeString("state"),
      createdAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.createdAt,
      }),
      status: t.field({
        type: ApiRequestStatus,
        resolve: async (parent) => {
          const [run] = await db
            .select({ status: runs.status })
            .from(runs)
            .where(eq(runs.id, parent.runId))
            .limit(1);

          if (!run) return "failed";
          if (
            run.status === "completed" ||
            run.status === "failed" ||
            run.status === "cancelled"
          ) {
            return run.status;
          }

          const [waiting] = await db
            .select({ id: queuedTasks.id })
            .from(queuedTasks)
            .where(
              and(
                eq(queuedTasks.runId, parent.runId),
                eq(queuedTasks.status, "awaiting_input"),
              ),
            )
            .limit(1);

          return waiting ? "awaiting_input" : "running";
        },
      }),
    }),
  });

export const CreatedApiEndpointType = builder
  .objectRef<CreatedApiEndpoint>("CreatedApiEndpoint")
  .implement({
    fields: (t) => ({
      endpoint: t.field({
        type: ApiEndpoint,
        resolve: (parent) => parent.endpoint,
      }),
      apiKey: t.exposeString("apiKey"),
    }),
  });

export const StandardApiKey = builder
  .objectRef<StandardApiKeyRow>("StandardApiKey")
  .implement({
    fields: (t) => ({
      keyPrefix: t.exposeString("keyPrefix"),
      keyLastFour: t.exposeString("keyLastFour"),
      createdAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.createdAt,
      }),
      updatedAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.updatedAt,
      }),
    }),
  });

export const CreatedStandardApiKeyType = builder
  .objectRef<CreatedStandardApiKey>("CreatedStandardApiKey")
  .implement({
    fields: (t) => ({
      standardApiKey: t.field({
        type: StandardApiKey,
        resolve: (parent) => parent.standardApiKey,
      }),
      apiKey: t.exposeString("apiKey"),
    }),
  });
