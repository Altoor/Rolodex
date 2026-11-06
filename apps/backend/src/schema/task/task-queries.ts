import { GraphQLError } from "graphql";
import { and, asc, eq, inArray } from "drizzle-orm";
import { builder, db } from "../builder";
import { requireUserId } from "../auth";
import { Task, TaskResult, QueuedTask } from "./";
import { queuedTasks } from "../../db";

builder.queryType({
  fields: (t) => ({
    tasks: t.drizzleField({
      type: [Task],
      resolve: (_query, _root, _args, ctx) => {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        return db.query.tasks.findMany();
      },
    }),

    getTask: t.drizzleField({
      type: Task,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: (_query, _root, { id }, ctx) => {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        const task = db.query.tasks.findFirst({ where: { id: id } });

        if (!task) {
          throw new GraphQLError("Task not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        return task;
      },
    }),

    taskResults: t.drizzleField({
      type: [TaskResult],
      resolve: (_query, _root, _args, ctx) => {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        return db.query.taskResults.findMany();
      },
    }),

    getTaskResults: t.drizzleField({
      type: TaskResult,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: (_query, _root, { id }, ctx) => {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        const taskResult = db.query.taskResults.findFirst({
          where: { id: id },
        });

        if (!taskResult) {
          throw new GraphQLError("TaskResult not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        return taskResult;
      },
    }),

    queuedTasks: t.field({
      type: [QueuedTask],
      resolve: async (_root, _args, ctx) => {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        return db.query.queuedTasks.findMany();
      },
    }),

    queuedTask: t.field({
      type: [QueuedTask],
      args: {
        runId: t.arg.string(),
      },
      resolve: async (_root, { runId }, ctx) => {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

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
        "Every step of the current user's chain runs that are still queued or running.",
      resolve: async (_root, _args, ctx) => {
        const userId = requireUserId(ctx);

        const activeRuns = await db
          .selectDistinct({ runId: queuedTasks.runId })
          .from(queuedTasks)
          .where(
            and(
              eq(queuedTasks.queued_by, userId),
              inArray(queuedTasks.status, ["queued", "running"]),
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
