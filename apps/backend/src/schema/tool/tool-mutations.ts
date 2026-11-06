import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { requireUserId } from "../auth";
import {
  assertPulledModel,
  getDecisionModelForUser,
  getModelForUser,
} from "../../ai/model";
import { getTool } from "../../tools/registry";
import { ToolInputError, type ToolExecution } from "../../tools/types";
import { ToolTestResult } from "./tool";

builder.mutationType({
  fields: (t) => ({
    testTool: t.field({
      type: ToolTestResult,
      args: {
        key: t.arg.string({ required: true }),
        state: t.arg.string({ required: true }),
        toolConfig: t.arg({ type: "JSON" }),
        model: t.arg.string(),
        decisionModel: t.arg.string(),
      },
      resolve: async (
        _root,
        { key, state, toolConfig, model: modelArg, decisionModel: decisionArg },
        ctx,
      ) => {
        const userId = requireUserId(ctx);
        const tool = getTool(key);

        if (!tool) {
          throw new GraphQLError(`Unknown tool "${key}"`, {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const config = (toolConfig as Record<string, unknown> | null) ?? null;

        try {
          if (modelArg) await assertPulledModel(modelArg);
          if (decisionArg) await assertPulledModel(decisionArg);

          const configModel =
            typeof config?.model === "string" ? config.model : null;
          const configDecisionModel =
            typeof config?.decisionModel === "string"
              ? config.decisionModel
              : null;

          const model =
            modelArg ?? configModel ?? (await getModelForUser(userId));
          const decisionModel =
            decisionArg ??
            configDecisionModel ??
            (await getDecisionModelForUser(userId));

          const execution: ToolExecution = await tool.execute({
            userId,
            runId: "test",
            taskId: -1,
            queuedTaskId: -1,
            state,
            config,
            model,
            decisionModel,
          });

          return { output: execution.output, summary: execution.summary };
        } catch (err) {
          throw new GraphQLError(
            err instanceof Error ? err.message : String(err),
            {
              extensions: {
                code:
                  err instanceof ToolInputError
                    ? "BAD_USER_INPUT"
                    : "INTERNAL_SERVER_ERROR",
              },
            },
          );
        }
      },
    }),
  }),
});
