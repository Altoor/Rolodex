import { GraphQLError } from "graphql";
import { builder, db } from "../../builder";
import { requireUser } from "../../auth";
import { Task } from "./task";

builder.queryType({
  fields: (t) => ({
    tasks: t.drizzleField({
      type: [Task],
      resolve: (_query, _root, _args, ctx) => {
        requireUser(ctx, "BAD_USER_INPUT");
        return db.query.tasks.findMany();
      },
    }),

    getTask: t.drizzleField({
      type: Task,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_query, _root, { id }, ctx) => {
        requireUser(ctx, "BAD_USER_INPUT");

        const task = await db.query.tasks.findFirst({ where: { id } });

        if (!task) {
          throw new GraphQLError("Task not found", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        return task;
      },
    }),
  }),
});
