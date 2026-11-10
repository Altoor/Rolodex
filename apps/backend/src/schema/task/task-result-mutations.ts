import { builder } from "../builder";
import { requireUserId } from "../auth";
import { DecisionType } from "../ai";
import { TaskResult } from "./task-result";
import {
  createTaskResult,
  deleteTaskResult,
  updateTaskResult,
} from "./task-result-service";

builder.mutationType({
  fields: (t) => ({
    createTaskResult: t.drizzleField({
      type: TaskResult,
      args: {
        taskId: t.arg.int({ required: true }),
        type: t.arg({ type: DecisionType, required: true }),
        option: t.arg.string(),
        scoreThreshold: t.arg.float(),
        probabilityThreshold: t.arg.float(),
        confidenceThreshold: t.arg.float(),
        resultTaskId: t.arg.int(),
      },
      resolve: async (
        _query,
        _root,
        {
          taskId,
          type,
          option,
          scoreThreshold,
          probabilityThreshold,
          confidenceThreshold,
          resultTaskId,
        },
        ctx,
      ) => {
        requireUserId(ctx);

        return createTaskResult({
          taskId,
          type,
          option,
          scoreThreshold,
          probabilityThreshold,
          confidenceThreshold,
          resultTaskId,
        });
      },
    }),

    updateTaskResult: t.drizzleField({
      type: TaskResult,
      args: {
        id: t.arg.int({ required: true }),
        taskId: t.arg.int(),
        type: t.arg({ type: DecisionType }),
        option: t.arg.string(),
        scoreThreshold: t.arg.float(),
        probabilityThreshold: t.arg.float(),
        confidenceThreshold: t.arg.float(),
        resultTaskId: t.arg.int(),
      },
      resolve: async (
        _query,
        _root,
        {
          id,
          taskId,
          type,
          option,
          scoreThreshold,
          probabilityThreshold,
          confidenceThreshold,
          resultTaskId,
        },
        ctx,
      ) => {
        requireUserId(ctx);

        return updateTaskResult({
          id,
          taskId,
          type,
          option,
          scoreThreshold,
          probabilityThreshold,
          confidenceThreshold,
          resultTaskId,
        });
      },
    }),

    deleteTaskResult: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        requireUserId(ctx);
        return deleteTaskResult(id);
      },
    }),
  }),
});
