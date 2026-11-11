import type { ToolExecution } from "../model/tool-execution";
import type {
  ToolStateEntry,
  ToolStateEntryInput,
} from "../model/tool-state";

/**
 * Serializes accumulated tool state for prompts or for the append_state /
 * set_state tools. Entries are serialized as-is.
 */
export function serializeToolState(
  toolState: ToolStateEntry[],
  format: "json" | "text" = "json",
): string {
  if (format === "text") {
    return toolState
      .map((entry) =>
        typeof entry === "string" ? entry : JSON.stringify(entry, null, 2),
      )
      .join("\n\n");
  }

  return JSON.stringify(toolState, null, 2);
}

export function toToolStateEntries(
  input: ToolStateEntryInput | ToolStateEntryInput[],
): ToolStateEntry[] {
  return Array.isArray(input) ? input : [input];
}

export interface ApplyExecutionOptions {
  /** Append `execution.output` after applying the explicit state changes. */
  appendOutput?: boolean;
}

/**
 * Applies a tool execution's state changes to an existing tool state.
 * Shared by the queue processor and the tool test mutation so both paths
 * behave identically.
 */
export function applyExecutionToToolState(
  initial: ToolStateEntry[],
  execution: ToolExecution,
  options: ApplyExecutionOptions = {},
): ToolStateEntry[] {
  let next = execution.toolState ?? initial;

  if (execution.toolStateAppend !== undefined) {
    next = [...next, ...toToolStateEntries(execution.toolStateAppend)];
  }

  if (execution.clearToolState) next = [];

  if (options.appendOutput && execution.toolStateAppend === undefined) {
    next = [...next, execution.output];
  }

  return next;
}
