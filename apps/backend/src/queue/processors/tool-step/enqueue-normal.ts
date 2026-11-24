import type { ToolExecution, ToolStateEntry } from "@repo/tools";
import type { queuedTasks } from "@repo/db";
import type { QueuedRow } from "../../types";

export type QueuedStepInsert = typeof queuedTasks.$inferInsert;

export interface PlanNormalArgs {
  row: QueuedRow;
  execution: ToolExecution;
  nextTaskId: number;
  nextState: string;
  nextToolState: ToolStateEntry[];
}

/** Plans the single next step for a normal-output tool. */
export function planNormalNext({
  row,
  execution,
  nextTaskId,
  nextState,
  nextToolState,
}: PlanNormalArgs): QueuedStepInsert {
  return {
    taskId: nextTaskId,
    state: nextState,
    toolState: nextToolState,
    depth: row.depth + 1,
    parentQueuedTaskId: row.id,
    runId: row.runId,
    queued_by: row.queued_by,
    model: execution.nextModel ?? row.model,
    decisionModel: execution.nextDecisionModel ?? row.decisionModel,
  };
}
