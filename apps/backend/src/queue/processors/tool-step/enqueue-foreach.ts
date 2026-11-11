import type { ToolExecution, ToolStateEntry } from "@repo/tools";
import { MAX_CHAIN_DEPTH, MAX_FOREACH_ITEMS } from "../../constants";
import { enqueueSteps } from "../../step-store";
import type { QueuedRow } from "../../types";

export interface EnqueueForeachArgs {
  row: QueuedRow;
  execution: ToolExecution;
  nextTaskId: number | null;
  nextState: string;
  nextToolState: ToolStateEntry[];
}

export interface ForeachEnqueueResult {
  itemCount: number;
  nextTaskId: number | null;
  childQueuedTaskIds: number[];
  note?: string;
  failureNote?: string;
}

/**
 * Fans a foreach tool result out into child steps. Returns a failure note when
 * the item limit or configuration is invalid; otherwise returns the ids of the
 * enqueued children.
 */
export async function enqueueForeach({
  row,
  execution,
  nextTaskId,
  nextState,
  nextToolState,
}: EnqueueForeachArgs): Promise<ForeachEnqueueResult> {
  const items = execution.foreach?.items ?? [];
  const itemCount = items.length;

  if (items.length > MAX_FOREACH_ITEMS) {
    return {
      itemCount,
      nextTaskId,
      childQueuedTaskIds: [],
      failureNote: `foreach returned ${items.length} items; max is ${MAX_FOREACH_ITEMS}`,
    };
  }

  const forkTaskId = execution.foreach?.nextTaskId ?? nextTaskId;

  if (items.length > 0 && forkTaskId == null) {
    return {
      itemCount,
      nextTaskId,
      childQueuedTaskIds: [],
      failureNote: "foreach has no next task configured",
    };
  }

  if (items.length > 0 && row.depth >= MAX_CHAIN_DEPTH) {
    return {
      itemCount,
      nextTaskId: null,
      childQueuedTaskIds: [],
      note: `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`,
    };
  }

  if (items.length > 0 && forkTaskId != null) {
    const childQueuedTaskIds = await enqueueSteps(
      items.map((item) => ({
        taskId: forkTaskId,
        state: nextState,
        toolState: [...nextToolState, item],
        depth: row.depth + 1,
        parentQueuedTaskId: row.id,
        runId: row.runId,
        queued_by: row.queued_by,
        model: execution.nextModel ?? row.model,
        decisionModel: execution.nextDecisionModel ?? row.decisionModel,
      })),
    );

    return {
      itemCount,
      nextTaskId: forkTaskId,
      childQueuedTaskIds,
    };
  }

  return {
    itemCount,
    nextTaskId: null,
    childQueuedTaskIds: [],
    note: "foreach returned no items — no next tasks enqueued",
  };
}
