import {
  getTool,
  type Tool,
  type ToolConfig,
  type ToolOutputType,
} from "@repo/tools";
import type { TaskRow } from "../../types";

export type ToolStepValidation =
  | {
      ok: true;
      tool: Tool;
      toolKey: string;
      outputType: ToolOutputType;
      toolConfig: ToolConfig | null;
    }
  | {
      ok: false;
      toolKey: string | null;
      note: string;
    };

/** Validates a tool task before execution. */
export function validateToolStep(task: TaskRow): ToolStepValidation {
  if (!task.toolKey) {
    return {
      ok: false,
      toolKey: null,
      note: "tool task has no toolKey",
    };
  }

  const tool = getTool(task.toolKey);
  if (!tool) {
    return {
      ok: false,
      toolKey: task.toolKey,
      note: `unknown tool "${task.toolKey}"`,
    };
  }

  const outputType = (task.toolOutputType ?? "normal") as ToolOutputType;
  const supportedOutputTypes = tool.definition.outputTypes ?? ["normal"];

  if (!supportedOutputTypes.includes(outputType)) {
    return {
      ok: false,
      toolKey: task.toolKey,
      note: `tool "${task.toolKey}" does not support output type "${outputType}"`,
    };
  }

  return {
    ok: true,
    tool,
    toolKey: task.toolKey,
    outputType,
    toolConfig: (task.toolConfig as ToolConfig | null) ?? null,
  };
}
