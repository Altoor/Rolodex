import type { ToolExecution } from "@repo/tools";
import type { TaskRow } from "../../types";

export interface ResolvedToolBranch {
  nextTaskId: number | null;
  branch: "true" | "false" | "tool" | "none";
  note?: string;
}

/** Maps a tool execution to the next task id and branch label. */
export function resolveToolBranch(
  task: TaskRow,
  execution: ToolExecution,
): ResolvedToolBranch {
  let nextTaskId: number | null;
  let branch: ResolvedToolBranch["branch"];

  if (execution.branch === "true") {
    nextTaskId = task.onTrueTaskId;
    branch = "true";
  } else if (execution.branch === "false") {
    nextTaskId = task.onFalseTaskId;
    branch = "false";
  } else {
    nextTaskId = execution.nextTaskId ?? task.fallbackTaskId ?? null;
    branch = nextTaskId != null ? "tool" : "none";
  }

  const note =
    execution.branch && nextTaskId == null
      ? `branch "${execution.branch}" has no target task configured — run stopped`
      : undefined;

  return { nextTaskId, branch, note };
}
