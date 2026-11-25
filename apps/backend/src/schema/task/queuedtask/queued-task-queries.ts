import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { builder, db } from "../../builder";
import { requireUserId } from "../../auth";
import { queuedTasks, runs } from "@repo/db";
import { QueuedTask } from "./queued-task";

type RunRow = typeof runs.$inferSelect;

export const StandardRunStatus = builder.enumType("StandardRunStatus", {
  values: ["running", "completed", "cancelled", "failed"],
});

/** A finished standard run with its full chain of steps. */
export const StandardRun = builder
  .objectRef<RunRow>("StandardRun")
  .implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      status: t.field({
        type: StandardRunStatus,
        resolve: (parent) =>
          parent.status as "running" | "completed" | "cancelled" | "failed",
      }),
      state: t.exposeString("state"),
      startTaskId: t.exposeInt("startTaskId", { nullable: true }),
      createdAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.createdAt,
      }),
      updatedAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.updatedAt,
      }),
      steps: t.field({
        type: [QueuedTask],
        resolve: (parent) =>
          db
            .select()
            .from(queuedTasks)
            .where(eq(queuedTasks.runId, parent.id))
            .orderBy(asc(queuedTasks.queued_at), asc(queuedTasks.id)),
      }),
    }),
  });

/**
 * Standard task-queue views deliberately exclude assisted steps. Assisted
 * steps are visible through the assisted-run read model and disappear with
 * the run when it is cancelled.
 */
function standardSteps(userId: number) {
  return and(eq(queuedTasks.queued_by, userId), eq(runs.mode, "standard"));
}

builder.queryType({
  fields: (t) => ({
    queuedTasks: t.field({
      type: [QueuedTask],
      resolve: async (_root, _args, ctx) => {
        const userId = requireUserId(ctx);
        const rows = await db
          .select({ row: queuedTasks })
          .from(queuedTasks)
          .innerJoin(runs, eq(queuedTasks.runId, runs.id))
          .where(standardSteps(userId))
          .orderBy(asc(queuedTasks.queued_at), asc(queuedTasks.id));
        return rows.map(({ row }) => row);
      },
    }),

    queuedTask: t.field({
      type: [QueuedTask],
      args: {
        runId: t.arg.string(),
      },
      resolve: async (_root, { runId }, ctx) => {
        const userId = requireUserId(ctx);

        const rows = await db
          .select({ row: queuedTasks })
          .from(queuedTasks)
          .innerJoin(runs, eq(queuedTasks.runId, runs.id))
          .where(
            and(
              eq(runs.userId, userId),
              runId ? eq(queuedTasks.runId, runId) : undefined,
            ),
          )
          .orderBy(asc(queuedTasks.queued_at), asc(queuedTasks.id));

        return rows.map(({ row }) => row);
      },
    }),

    activeQueuedTasks: t.field({
      type: [QueuedTask],
      description:
        "Every step of the current user's standard chain runs that are still queued, running, or waiting for user input.",
      resolve: async (_root, _args, ctx) => {
        const userId = requireUserId(ctx);

        const activeRuns = await db
          .selectDistinct({ runId: queuedTasks.runId })
          .from(queuedTasks)
          .innerJoin(runs, eq(queuedTasks.runId, runs.id))
          .where(
            and(
              standardSteps(userId),
              inArray(queuedTasks.status, [
                "queued",
                "running",
                "awaiting_input",
                "waiting",
              ]),
            ),
          );

        if (activeRuns.length === 0) return [];

        return db
          .select()
          .from(queuedTasks)
          .where(
            and(
              eq(queuedTasks.queued_by, userId),
              inArray(
                queuedTasks.runId,
                activeRuns.map((run) => run.runId),
              ),
            ),
          )
          .orderBy(asc(queuedTasks.queued_at), asc(queuedTasks.id));
      },
    }),

    standardRunHistory: t.field({
      type: [StandardRun],
      description:
        "Finished, cancelled, and failed standard runs for the current user, newest first.",
      args: {
        limit: t.arg.int({ defaultValue: 20 }),
        offset: t.arg.int({ defaultValue: 0 }),
      },
      resolve: async (_root, { limit, offset }, ctx) => {
        const userId = requireUserId(ctx);
        return db
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.userId, userId),
              eq(runs.mode, "standard"),
              inArray(runs.status, ["completed", "cancelled", "failed"]),
            ),
          )
          .orderBy(desc(runs.createdAt))
          .limit(Math.min(Math.max(limit ?? 20, 1), 100))
          .offset(Math.max(offset ?? 0, 0));
      },
    }),
  }),
});
