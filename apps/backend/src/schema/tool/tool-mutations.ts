import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { requireUserId } from "../auth";
import {
  assertPulledModel,
  getDecisionModelForUser,
  getModelForUser,
} from "../../ai/model";
import { getTool } from "../../tools/registry";
import {
  ToolInputError,
  type ToolExecution,
  type ToolOutputType,
  type ToolStateEntry,
  type ToolStateEntryInput,
} from "../../tools/types";
import { ToolTestResult } from "./tool";

function toTestEntries(
  input: ToolStateEntryInput | ToolStateEntryInput[],
): ToolStateEntry[] {
  return Array.isArray(input) ? input : [input];
}

function applyExecution(
  initial: ToolStateEntry[],
  execution: ToolExecution,
  appendOutput: boolean,
): ToolStateEntry[] {
  let next = execution.toolState ?? initial;

  if (execution.toolStateAppend !== undefined) {
    next = [...next, ...toTestEntries(execution.toolStateAppend)];
  }

  if (execution.stateAppend !== undefined) {
    next = [...next, { text: execution.stateAppend }];
  }

  if (execution.clearToolState) next = [];

  if (
    appendOutput &&
    execution.toolStateAppend === undefined &&
    execution.stateAppend === undefined
  ) {
    next = [...next, execution.output];
  }

  return next;
}

function parseToolState(value: unknown): ToolStateEntry[] {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new ToolInputError("toolState must be a JSON array");
  }

  return value;
}

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
          model: modelArg,
          decisionModel: decisionArg,
          toolState: toolStateArg,
          outputType: outputTypeArg,
        },
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
          const outputType = (outputTypeArg ?? "normal") as ToolOutputType;
          const supportedOutputTypes =
            tool.definition.outputTypes ?? ["normal"];

          if (!supportedOutputTypes.includes(outputType)) {
            throw new ToolInputError(
              `tool "${key}" does not support output type "${outputType}"`,
            );
          }

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

          const initialToolState = parseToolState(toolStateArg);

          const execution: ToolExecution = await tool.execute({
            userId,
            runId: "test",
            taskId: -1,
            queuedTaskId: -1,
            state,
            toolState: initialToolState,
            outputType,
            config,
            model,
            decisionModel,
          });

          const nextToolState = applyExecution(
            initialToolState,
            execution,
            outputType === "normal" &&
              (execution.appendState ?? Boolean(config?.appendState)),
          );

          return {
            output: execution.output,
            summary: execution.summary,
            state: execution.nextState ?? state,
            toolState: nextToolState,
          };
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
