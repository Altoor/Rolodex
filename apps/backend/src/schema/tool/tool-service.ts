import { GraphQLError } from "graphql";
import {
  assertPulledModel,
  getDecisionModelForUser,
  getModelForUser,
} from "@repo/ai";
import {
  applyExecutionToToolState,
  getTool,
  ToolInputError,
  type ToolExecution,
  type ToolOutputType,
  type ToolStateEntry,
} from "@repo/tools";
import type { ToolTestResultPayload } from "./tool-test-result";

export interface RunToolTestInput {
  key: string;
  state: string;
  toolConfig?: unknown;
  model?: string | null;
  decisionModel?: string | null;
  toolState?: unknown;
  outputType?: string | null;
}

function parseToolState(value: unknown): ToolStateEntry[] {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new ToolInputError("toolState must be a JSON array");
  }

  return value;
}

/** Executes a tool with the same state-application rules as the queue. */
export async function runToolTest(
  userId: number,
  input: RunToolTestInput,
): Promise<ToolTestResultPayload> {
  const tool = getTool(input.key);

  if (!tool) {
    throw new GraphQLError(`Unknown tool "${input.key}"`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const config = (input.toolConfig as Record<string, unknown> | null) ?? null;

  try {
    const outputType = (input.outputType ?? "normal") as ToolOutputType;
    const supportedOutputTypes = tool.definition.outputTypes ?? ["normal"];

    if (!supportedOutputTypes.includes(outputType)) {
      throw new ToolInputError(
        `tool "${input.key}" does not support output type "${outputType}"`,
      );
    }

    if (input.model) await assertPulledModel(input.model);
    if (input.decisionModel) await assertPulledModel(input.decisionModel);

    const configModel =
      typeof config?.model === "string" ? config.model : null;
    const configDecisionModel =
      typeof config?.decisionModel === "string" ? config.decisionModel : null;

    const model =
      input.model ?? configModel ?? (await getModelForUser(userId));
    const decisionModel =
      input.decisionModel ??
      configDecisionModel ??
      (await getDecisionModelForUser(userId));

    const initialToolState = parseToolState(input.toolState);

    const execution: ToolExecution = await tool.execute({
      userId,
      runId: "test",
      taskId: -1,
      queuedTaskId: -1,
      state: input.state,
      toolState: initialToolState,
      outputType,
      config,
      model,
      decisionModel,
    });

    const appendOutput =
      outputType === "normal" &&
      (execution.appendOutput ?? Boolean(config?.appendState));

    const nextToolState = applyExecutionToToolState(
      initialToolState,
      execution,
      { appendOutput },
    );

    return {
      output: execution.output,
      summary: execution.summary,
      state: execution.nextState ?? input.state,
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
}
