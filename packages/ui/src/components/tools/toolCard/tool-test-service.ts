import type { GetToolsQuery } from "@repo/queries/__generated__/graphql";

export type ToolView = NonNullable<GetToolsQuery["tools"]>[number];

export type ToolTestInputs = {
  state: string;
  toolConfig: string;
  toolState: string;
  outputType: string;
  model: string;
  decisionModel: string;
};

export type ToolTestErrorField = "toolConfig" | "toolState" | "root";

export class ToolTestInputError extends Error {
  field: ToolTestErrorField;

  constructor(field: ToolTestErrorField, message: string) {
    super(message);
    this.name = "ToolTestInputError";
    this.field = field;
  }
}

export const parseToolConfig = (
  value: string,
): Record<string, unknown> | null => {
  if (!value.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    throw new ToolTestInputError(
      "toolConfig",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ToolTestInputError(
      "toolConfig",
      "toolConfig must be a JSON object",
    );
  }

  return parsed as Record<string, unknown>;
};

export const parseToolState = (value: string): unknown[] => {
  if (!value.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    throw new ToolTestInputError(
      "toolState",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!Array.isArray(parsed)) {
    throw new ToolTestInputError("toolState", "toolState must be a JSON array");
  }

  return parsed;
};

/** Builds the testTool mutation variables from the form values. */
export function buildTestToolVariables(
  tool: ToolView,
  inputs: ToolTestInputs,
) {
  if (!tool.key) {
    throw new ToolTestInputError("root", "Tool has no key");
  }

  return {
    key: tool.key,
    state: inputs.state,
    toolConfig: parseToolConfig(inputs.toolConfig),
    toolState: parseToolState(inputs.toolState),
    outputType: inputs.outputType.trim() || "normal",
    model: inputs.model.trim() || null,
    decisionModel: inputs.decisionModel.trim() || null,
  };
}
