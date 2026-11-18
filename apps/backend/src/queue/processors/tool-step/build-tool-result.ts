import type { ToolExecution, ToolOutputType } from "@repo/tools";

export interface BuildToolResultArgs {
  toolKey: string;
  execution: ToolExecution;
  outputType: ToolOutputType;
  branch: "true" | "false" | "tool" | "none";
  nextTaskId: number | null;
  itemCount?: number;
  childQueuedTaskIds: number[];
  note?: string;
}

/** Builds the JSON payload stored on `queuedTasks.result`. */
export function buildToolResult({
  toolKey,
  execution,
  outputType,
  branch,
  nextTaskId,
  itemCount,
  childQueuedTaskIds,
  note,
}: BuildToolResultArgs): Record<string, unknown> {
  return {
    toolKey,
    output: execution.output,
    summary: execution.summary,
    outputType,
    branch,
    nextTaskId,
    ...(execution.branchLabel
      ? { branchLabel: execution.branchLabel }
      : {}),
    ...(itemCount !== undefined ? { itemCount } : {}),
    ...(childQueuedTaskIds.length > 0 ? { childQueuedTaskIds } : {}),
    ...(note ? { note } : {}),
  };
}
