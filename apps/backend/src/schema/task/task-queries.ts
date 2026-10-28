import { GraphQLError } from "graphql";
import { builder, db } from "../builder";
import { Task, TaskResult } from "./";

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
  }),
});
