import { GraphQLError } from "graphql";
import { eq, or } from "drizzle-orm";
import { tasks } from "@repo/db";
import { builder, db } from "../../builder";
import { requireUser, requireUserId } from "../../auth";
import { Task } from "./task";

/** Visible tasks: normal tasks plus the current user's assisted drafts. */
function visibleTasks(userId: number) {
  return or(eq(tasks.isDraft, false), eq(tasks.draftOwnerId, userId));
}

builder.queryType({
  fields: (t) => ({
    tasks: t.field({
      type: [Task],
      resolve: async (_root, _args, ctx) => {
        const userId = requireUserId(ctx);
        return db.select().from(tasks).where(visibleTasks(userId));
      },
    }),

    getTask: t.field({
      type: Task,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
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
