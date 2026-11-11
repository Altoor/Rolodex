import { builder } from "../../builder";
import { requireUserId } from "../../auth";
import { Task, TaskType, ToolOutputType, UserDecisionType } from "./task";
import { createTask, deleteTask, updateTask } from "./task-service";

builder.mutationType({
  fields: (t) => ({
    createTask: t.drizzleField({
      type: Task,
      args: {
        name: t.arg.string({ required: true }),
        decisionId: t.arg.int(),
        fallbackTaskId: t.arg.int(),
        type: t.arg({ type: TaskType, required: true }),
        toolKey: t.arg.string(),
        toolConfig: t.arg({ type: "JSON" }),
        toolOutputType: t.arg({ type: ToolOutputType }),
        onTrueTaskId: t.arg.int(),
        onFalseTaskId: t.arg.int(),
        model: t.arg.string(),
        decisionModel: t.arg.string(),
        forceUserDecideIfNoMatch: t.arg.boolean(),
        userDecisionType: t.arg({ type: UserDecisionType }),
        userDecisionConfig: t.arg({ type: "JSON" }),
      },
      resolve: async (
        _query,
        _root,
        {
          name,
          decisionId,
          fallbackTaskId,
          type,
          toolKey,
          toolConfig,
          toolOutputType,
          onTrueTaskId,
          onFalseTaskId,
          model,
          decisionModel,
          forceUserDecideIfNoMatch,
          userDecisionType,
          userDecisionConfig,
        },
        ctx,
      ) => {
        requireUserId(ctx);

        return createTask({
          name,
          type,
          decisionId,
          fallbackTaskId,
          toolKey,
          toolConfig,
          toolOutputType,
          onTrueTaskId,
          onFalseTaskId,
          model,
          decisionModel,
          forceUserDecideIfNoMatch,
          userDecisionType,
          userDecisionConfig,
        });
      },
    }),

    updateTask: t.drizzleField({
      type: Task,
      args: {
        id: t.arg.int({ required: true }),
        name: t.arg.string(),
        decisionId: t.arg.int(),
        fallbackTaskId: t.arg.int(),
        type: t.arg({ type: TaskType }),
        toolKey: t.arg.string(),
        toolConfig: t.arg({ type: "JSON" }),
        toolOutputType: t.arg({ type: ToolOutputType }),
        onTrueTaskId: t.arg.int(),
        onFalseTaskId: t.arg.int(),
        model: t.arg.string(),
        decisionModel: t.arg.string(),
        forceUserDecideIfNoMatch: t.arg.boolean(),
        userDecisionType: t.arg({ type: UserDecisionType }),
        userDecisionConfig: t.arg({ type: "JSON" }),
      },
      resolve: async (
        _query,
        _root,
        {
          id,
          name,
          type,
          decisionId,
          fallbackTaskId,
          toolKey,
          toolConfig,
          toolOutputType,
          onTrueTaskId,
          onFalseTaskId,
          model,
          decisionModel,
          forceUserDecideIfNoMatch,
          userDecisionType,
          userDecisionConfig,
        },
        ctx,
      ) => {
        requireUserId(ctx);

        return updateTask({
          id,
          name,
          type,
          decisionId,
          fallbackTaskId,
          toolKey,
          toolConfig,
          toolOutputType,
          onTrueTaskId,
          onFalseTaskId,
          model,
          decisionModel,
          forceUserDecideIfNoMatch,
          userDecisionType,
          userDecisionConfig,
        });
      },
    }),

    deleteTask: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        requireUserId(ctx);
        return deleteTask(id);
      },
    }),
  }),
});
