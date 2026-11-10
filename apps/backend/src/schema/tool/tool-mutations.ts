import { builder } from "../builder";
import { requireUserId } from "../auth";
import { ToolTestResult } from "./tool-test-result";
import { runToolTest } from "./tool-service";

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
        toolState: t.arg({ type: "JSON" }),
        outputType: t.arg.string(),
      },
      resolve: async (
        _root,
        {
          key,
          state,
          toolConfig,
          model,
          decisionModel,
          toolState,
          outputType,
        },
        ctx,
      ) => {
        const userId = requireUserId(ctx);

        return runToolTest(userId, {
          key,
          state,
          toolConfig,
          model,
          decisionModel,
          toolState,
          outputType,
        });
      },
    }),
  }),
});
