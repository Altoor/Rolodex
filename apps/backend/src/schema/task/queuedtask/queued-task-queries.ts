import { and, asc, eq, inArray } from "drizzle-orm";
import { builder, db } from "../../builder";
import { requireUser, requireUserId } from "../../auth";
import { queuedTasks } from "@repo/db";
import { QueuedTask } from "./queued-task";

builder.queryType({
  fields: (t) => ({
    queuedTasks: t.field({
      type: [QueuedTask],
      resolve: async (_root, _args, ctx) => {
        requireUser(ctx, "BAD_USER_INPUT");
        return db.query.queuedTasks.findMany();
      },
    }),

    queuedTask: t.field({
      type: [QueuedTask],
      args: {
        runId: t.arg.string(),
      },
      resolve: async (_root, { runId }, ctx) => {
        requireUser(ctx, "BAD_USER_INPUT");

        return db
          .select()
          .from(queuedTasks)
          .where(runId ? eq(queuedTasks.runId, runId) : undefined)
          .orderBy(asc(queuedTasks.queued_at), asc(queuedTasks.id));
      },
    }),

    activeQueuedTasks: t.field({
      type: [QueuedTask],
      description:
        "Every step of the current user's chain runs that are still queued, running, or waiting for user input.",
      resolve: async (_root, _args, ctx) => {
        const userId = requireUserId(ctx);

        const activeRuns = await db
          .selectDistinct({ runId: queuedTasks.runId })
          .from(queuedTasks)
          .where(
            and(
              eq(queuedTasks.queued_by, userId),
              inArray(queuedTasks.status, [
                "queued",
                "running",
                "awaiting_input",
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
  }),
});
