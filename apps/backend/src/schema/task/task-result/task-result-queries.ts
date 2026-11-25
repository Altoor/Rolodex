import { GraphQLError } from "graphql";
import { and, eq } from "drizzle-orm";
import { taskResults, tasks } from "@repo/db";
import { builder, db } from "../../builder";
import { requireUserId } from "../../auth";
import { visibleTaskCondition } from "../task/task-visibility";
import { TaskResult } from "./task-result";

builder.queryType({
  fields: (t) => ({
    taskResults: t.drizzleField({
      type: [TaskResult],
      resolve: async (_query, _root, _args, ctx) => {
        const userId = requireUserId(ctx);
        const rows = await db
          .select({ result: taskResults })
          .from(taskResults)
          .innerJoin(tasks, eq(tasks.id, taskResults.taskId))
          .where(visibleTaskCondition(userId));
        return rows.map((row) => row.result);
      },
    }),

    getTaskResults: t.drizzleField({
      type: TaskResult,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_query, _root, { id }, ctx) => {
        const userId = requireUserId(ctx);

        const [row] = await db
          .select({ result: taskResults })
          .from(taskResults)
          .innerJoin(tasks, eq(tasks.id, taskResults.taskId))
          .where(and(eq(taskResults.id, id), visibleTaskCondition(userId)))
          .limit(1);

        if (!row) {
          throw new GraphQLError("TaskResult not found", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        return row.result;
      },
    }),
  }),
});
