import { GraphQLError } from "graphql";
import { builder, db } from "../../builder";
import { requireUser } from "../../auth";
import { TaskResult } from "./task-result";

builder.queryType({
  fields: (t) => ({
    taskResults: t.drizzleField({
      type: [TaskResult],
      resolve: (_query, _root, _args, ctx) => {
        requireUser(ctx, "BAD_USER_INPUT");
        return db.query.taskResults.findMany();
      },
    }),

    getTaskResults: t.drizzleField({
      type: TaskResult,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_query, _root, { id }, ctx) => {
        requireUser(ctx, "BAD_USER_INPUT");

        const taskResult = await db.query.taskResults.findFirst({
          where: { id },
        });

        if (!taskResult) {
          throw new GraphQLError("TaskResult not found", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        return taskResult;
      },
    }),
  }),
});
