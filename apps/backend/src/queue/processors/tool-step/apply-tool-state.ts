import {
  applyExecutionToToolState,
  type ToolConfig,
  type ToolExecution,
  type ToolOutputType,
  type ToolStateEntry,
} from "@repo/tools";
import type { QueuedRow } from "../../types";

/** Applies a tool execution's state changes for the next queue step. */
export function applyToolState(
  row: QueuedRow,
  execution: ToolExecution,
  outputType: ToolOutputType,
  toolConfig: ToolConfig | null,
): ToolStateEntry[] {
  let nextToolState = applyExecutionToToolState(row.toolState, execution);

  if (outputType === "normal") {
    const append = execution.appendOutput ?? Boolean(toolConfig?.appendState);
    if (append && execution.toolStateAppend === undefined) {
      nextToolState = [...nextToolState, execution.output];
    }
  }

  return nextToolState;
}
