import { GraphQLError } from "graphql";
import { asc, eq } from "drizzle-orm";
import { builder, db } from "../builder";
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
  }),
});
