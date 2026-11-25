import { tasks } from "@repo/db";
import { builder, db } from "../../builder";
import { requireUserId } from "../../auth";
import { Task } from "./task";
import {
  loadVisibleTask,
  taskNotFound,
  visibleTaskCondition,
} from "./task-visibility";

builder.queryType({
  fields: (t) => ({
    tasks: t.field({
      type: [Task],
      resolve: async (_root, _args, ctx) => {
        const userId = requireUserId(ctx);
        return db.select().from(tasks).where(visibleTaskCondition(userId));
      },
    }),

    getTask: t.field({
      type: Task,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        const userId = requireUserId(ctx);
        const task = await loadVisibleTask(userId, id);
        if (!task) throw taskNotFound();
        return task;
      },
    }),
  }),
});
