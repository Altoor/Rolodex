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
        joinTaskId: t.arg.int(),
        model: t.arg.string(),
        decisionModel: t.arg.string(),
        decisionStateConfig: t.arg({ type: "JSON" }),
        forceUserDecideIfNoMatch: t.arg.boolean(),
        userDecisionType: t.arg({ type: UserDecisionType }),
        userDecisionConfig: t.arg({ type: "JSON" }),
        canRunInParallel: t.arg.boolean(),
        prioritize: t.arg.boolean(),
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
          joinTaskId,
          model,
          decisionModel,
          decisionStateConfig,
          forceUserDecideIfNoMatch,
          userDecisionType,
          userDecisionConfig,
          canRunInParallel,
          prioritize,
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
          joinTaskId,
          model,
          decisionModel,
          decisionStateConfig,
          forceUserDecideIfNoMatch,
          userDecisionType,
          userDecisionConfig,
          canRunInParallel,
          prioritize,
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
        joinTaskId: t.arg.int(),
        model: t.arg.string(),
        decisionModel: t.arg.string(),
        decisionStateConfig: t.arg({ type: "JSON" }),
        forceUserDecideIfNoMatch: t.arg.boolean(),
        userDecisionType: t.arg({ type: UserDecisionType }),
        userDecisionConfig: t.arg({ type: "JSON" }),
        canRunInParallel: t.arg.boolean(),
        prioritize: t.arg.boolean(),
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
          joinTaskId,
          model,
          decisionModel,
          decisionStateConfig,
          forceUserDecideIfNoMatch,
          userDecisionType,
          userDecisionConfig,
          canRunInParallel,
          prioritize,
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
          joinTaskId,
          model,
          decisionModel,
          decisionStateConfig,
          forceUserDecideIfNoMatch,
          userDecisionType,
          userDecisionConfig,
          canRunInParallel,
          prioritize,
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
