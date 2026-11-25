import { randomUUID } from "node:crypto";
import type { ToolExecution, ToolStateEntry } from "@repo/tools";
import type { queuedTasks } from "@repo/db";
import { MAX_CHAIN_DEPTH, MAX_FOREACH_ITEMS } from "../../constants";
import type { QueuedRow } from "../../types";

function newForkGroupId(): string {
  return randomUUID();
}

export type QueuedStepInsert = typeof queuedTasks.$inferInsert;

export interface PlanForeachArgs {
  row: QueuedRow;
  execution: ToolExecution;
  nextTaskId: number | null;
  nextState: string;
  nextToolState: ToolStateEntry[];
  /** The foreach task's optional post-fan-out barrier task. */
  joinTaskId?: number | null;
}

export interface ForeachPlan {
  itemCount: number;
  nextTaskId: number | null;
  nextSteps: QueuedStepInsert[];
  /** Set when this fan-out created a join barrier row. */
  forkGroupId?: string;
  /** The inserted join row, when one was planned. */
  joinTaskId?: number;
  note?: string;
  failureNote?: string;
}

/**
 * Plans the fan-out rows for a foreach tool. Planning is separated from
 * insertion so the standard queue can enqueue immediately while an assisted
 * step can wait for acceptance.
 */
export function planForeach({
  row,
  execution,
  nextTaskId,
  nextState,
  nextToolState,
  joinTaskId,
}: PlanForeachArgs): ForeachPlan {
  const items = execution.foreach?.items ?? [];
  const itemCount = items.length;

  if (row.forkGroupId != null) {
    return {
      itemCount,
      nextTaskId,
      nextSteps: [],
      failureNote:
        "foreach cannot be nested inside another foreach fan-out yet; stop the outer fan-in before fanning out again",
    };
  }

  if (items.length > MAX_FOREACH_ITEMS) {
    return {
      itemCount,
      nextTaskId,
      nextSteps: [],
      failureNote: `foreach returned ${items.length} items; max is ${MAX_FOREACH_ITEMS}`,
    };
  }

  const forkTaskId = execution.foreach?.nextTaskId ?? nextTaskId;

  if (items.length > 0 && forkTaskId == null) {
    return {
      itemCount,
      nextTaskId,
      nextSteps: [],
      failureNote: "foreach has no next task configured",
    };
  }

  if (items.length > 0 && row.depth >= MAX_CHAIN_DEPTH) {
    return {
      itemCount,
      nextTaskId: null,
      nextSteps: [],
      note: `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`,
    };
  }

  // A barrier without per-item work still has to run so the rest of the flow
  // continues with an empty result set.
  if (items.length === 0) {
    if (joinTaskId == null) {
      return {
        itemCount,
        nextTaskId: null,
        nextSteps: [],
        note: "foreach returned no items — no next tasks enqueued",
      };
    }

    const forkGroupId = newForkGroupId();
    return {
      itemCount,
      nextTaskId: null,
      forkGroupId,
      joinTaskId,
      nextSteps: [
        {
          taskId: joinTaskId,
          state: nextState,
          toolState: nextToolState,
          depth: row.depth + 1,
          parentQueuedTaskId: row.id,
          runId: row.runId,
          queued_by: row.queued_by,
          model: execution.nextModel ?? row.model,
          decisionModel: execution.nextDecisionModel ?? row.decisionModel,
          status: "queued",
          isJoin: true,
          forkGroupId,
          forkIndex: null,
        },
      ],
    };
  }

  if (forkTaskId == null) {
    return {
      itemCount,
      nextTaskId: null,
      nextSteps: [],
      note: "foreach returned no items — no next tasks enqueued",
    };
  }

  // Without a join barrier the fan-out behaves exactly as before; only a
  // barrier needs the shared fork lineage.
  const forkGroupId = joinTaskId != null ? newForkGroupId() : undefined;
  const nextSteps: QueuedStepInsert[] = items.map((item, index) => ({
    taskId: forkTaskId,
    state: nextState,
    toolState: [...nextToolState, item],
    depth: row.depth + 1,
    parentQueuedTaskId: row.id,
    runId: row.runId,
    queued_by: row.queued_by,
    model: execution.nextModel ?? row.model,
    decisionModel: execution.nextDecisionModel ?? row.decisionModel,
    isJoin: false,
    ...(forkGroupId ? { forkGroupId, forkIndex: index } : {}),
  }));

  if (joinTaskId != null) {
    nextSteps.push({
      taskId: joinTaskId,
      state: nextState,
      toolState: nextToolState,
      depth: row.depth + 1,
      parentQueuedTaskId: row.id,
      runId: row.runId,
      queued_by: row.queued_by,
      model: execution.nextModel ?? row.model,
      decisionModel: execution.nextDecisionModel ?? row.decisionModel,
      status: "waiting",
      isJoin: true,
      forkGroupId,
      forkIndex: null,
    });
  }

  return {
    itemCount,
    nextTaskId: forkTaskId,
    nextSteps,
    forkGroupId,
    joinTaskId: joinTaskId ?? undefined,
  };
}
