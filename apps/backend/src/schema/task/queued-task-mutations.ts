import { builder } from "../builder";
import { requireUserId } from "../auth";
import { QueuedTask } from "./queued-task";
import {
  completeQueuedTask,
  createQueuedTask,
  deleteCompletedQueuedTasksBefore,
  deleteQueuedTask,
} from "./queued-task-service";

builder.mutationType({
  fields: (t) => ({
    createQueuedTask: t.drizzleField({
      type: QueuedTask,
      args: {
        taskId: t.arg.int(),
        state: t.arg.string({ required: true }),
      },
      resolve: async (_query, _root, { taskId, state }, ctx) => {
        const userId = requireUserId(ctx);
        return createQueuedTask(userId, { taskId, state });
      },
    }),

    completeTask: t.drizzleField({
      type: QueuedTask,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_query, _root, { id }, ctx) => {
        requireUserId(ctx);
        return completeQueuedTask(id);
      },
    }),

    deleteCompletedQueuedTaskFromBefore: t.field({
      type: "String",
      args: {
        date: t.arg({ type: "DateTime", required: true }),
      },
      resolve: async (_root, { date }, ctx) => {
        requireUserId(ctx);
        return deleteCompletedQueuedTasksBefore(date);
      },
    }),

    deleteQueuedTask: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        requireUserId(ctx);
        return deleteQueuedTask(id);
      },
    }),
  }),
});
