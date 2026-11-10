import type { ToolExecution, ToolStateEntry } from "@repo/tools";
import { enqueueStep } from "../../step-store";
import type { QueuedRow } from "../../types";

export interface EnqueueNormalArgs {
  row: QueuedRow;
  execution: ToolExecution;
  nextTaskId: number;
  nextState: string;
  nextToolState: ToolStateEntry[];
}

/** Enqueues the single next step for a normal-output tool. */
export async function enqueueNormalNext({
  row,
  execution,
  nextTaskId,
  nextState,
  nextToolState,
}: EnqueueNormalArgs): Promise<void> {
  await enqueueStep({
    taskId: nextTaskId,
    state: nextState,
    toolState: nextToolState,
    depth: row.depth + 1,
    parentQueuedTaskId: row.id,
    runId: row.runId,
    queued_by: row.queued_by,
    model: execution.nextModel ?? row.model,
    decisionModel: execution.nextDecisionModel ?? row.decisionModel,
  });
}
