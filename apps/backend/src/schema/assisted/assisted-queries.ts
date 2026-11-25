import { GraphQLError } from "graphql";
import { and, desc, eq, or } from "drizzle-orm";
import { db, runs, traceEvents } from "@repo/db";
import { requireUserId } from "../auth";
import { builder } from "../builder";
import { AssistedRun, AssistedTraceEvent } from "./assisted-types";
import { loadRunRow, requireOwnedRun } from "./assisted-access";

builder.queryType({
  fields: (t) => ({
    assistedRun: t.field({
      type: AssistedRun,
      nullable: true,
      args: { runId: t.arg.string({ required: true }) },
      resolve: async (_root, { runId }, ctx) => {
        const userId = requireUserId(ctx);
        await requireOwnedRun(userId, runId);
        return loadRunRow(runId);
      },
    }),

    activeAssistedRuns: t.field({
      type: [AssistedRun],
      resolve: async (_root, _args, ctx) => {
        const userId = requireUserId(ctx);
        return db
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.userId, userId),
              eq(runs.mode, "assisted"),
              or(
                eq(runs.status, "running"),
                eq(runs.status, "awaiting_step_review"),
                eq(runs.status, "awaiting_decision_review"),
                eq(runs.status, "awaiting_user_choice"),
              ),
            ),
          )
          .orderBy(desc(runs.createdAt));
      },
    }),

    assistedRunHistory: t.field({
      type: [AssistedRun],
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
              eq(runs.mode, "assisted"),
              or(
                eq(runs.status, "completed"),
                eq(runs.status, "cancelled"),
                eq(runs.status, "failed"),
              ),
            ),
          )
          .orderBy(desc(runs.createdAt))
          .limit(Math.min(Math.max(limit ?? 20, 1), 100))
          .offset(Math.max(offset ?? 0, 0));
      },
    }),

    attemptTrace: t.field({
      type: [AssistedTraceEvent],
      args: { attemptId: t.arg.int({ required: true }) },
      resolve: async (_root, { attemptId }, ctx) => {
        const userId = requireUserId(ctx);
        const attempt = await db.query.stepAttempts.findFirst({
          where: { id: attemptId },
        });
        if (!attempt) {
          throw new GraphQLError("Attempt not found", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
        await requireOwnedRun(userId, attempt.runId);
        return db
          .select()
          .from(traceEvents)
          .where(eq(traceEvents.attemptId, attemptId))
          .orderBy(traceEvents.sequence);
      },
    }),
  }),
});
