import { getDecisionModelForUser, getModelForUser } from "@repo/ai";
import type { ToolStateEntry } from "@repo/tools";
import { MAX_CHAIN_DEPTH } from "../constants";
import { enqueueSteps, finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";
import { applyToolState } from "./tool-step/apply-tool-state";
import { buildToolResult } from "./tool-step/build-tool-result";
import {
  planForeach,
  type QueuedStepInsert,
} from "./tool-step/enqueue-foreach";
import { planNormalNext } from "./tool-step/enqueue-normal";
import { resolveToolBranch } from "./tool-step/resolve-tool-branch";
import { validateToolStep } from "./tool-step/validate-tool";

export interface ToolAttemptOutcome {
  result: Record<string, unknown>;
  summary?: string;
  nextState: string;
  nextToolState: ToolStateEntry[];
  nextSteps: QueuedStepInsert[];
}

export type ToolAttemptExecution =
  | { ok: true; toolKey: string; outcome: ToolAttemptOutcome }
  | { ok: false; toolKey: string | null; note: string };

/**
 * Executes a tool and plans its next steps without completing the step or
 * inserting anything. Standard runs apply the plan immediately; assisted runs
 * keep it until the user accepts the attempt.
 */
export async function executeToolAttempt(
  row: QueuedRow,
  task: TaskRow,
): Promise<ToolAttemptExecution> {
  const validation = validateToolStep(task);
  if (!validation.ok) {
    return {
      ok: false,
      toolKey: validation.toolKey,
      note: validation.note,
    };
  }

  const { tool, toolKey, outputType, toolConfig } = validation;

  try {
    const model =
      row.model ?? task.model ?? (await getModelForUser(row.queued_by));
    const decisionModel =
      row.decisionModel ??
      task.decisionModel ??
      (await getDecisionModelForUser(row.queued_by));

    const execution = await tool.execute({
      userId: row.queued_by,
      runId: row.runId,
      taskId: task.id,
      queuedTaskId: row.id,
      state: row.state,
      toolState: row.toolState,
      outputType,
      config: toolConfig,
      model,
      decisionModel,
    });

    const nextToolState = applyToolState(
      row,
      execution,
      outputType,
      toolConfig,
    );
    const nextState = execution.nextState ?? row.state;

    const resolved = resolveToolBranch(task, execution);
    const endFlow = execution.endFlow === true;
    let nextTaskId = endFlow ? null : resolved.nextTaskId;
    let note = endFlow ? undefined : resolved.note;
    let nextSteps: QueuedStepInsert[] = [];
    const childQueuedTaskIds: number[] = [];
    let itemCount: number | undefined;

    if (outputType === "normal") {
      if (nextTaskId != null) {
        if (row.depth >= MAX_CHAIN_DEPTH) {
          nextTaskId = null;
          note = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
        } else {
          nextSteps = [
            planNormalNext({
              row,
              execution,
              nextTaskId,
              nextState,
              nextToolState,
            }),
          ];
        }
      }
    } else {
      const foreach = planForeach({
        row,
        execution,
        nextTaskId,
        nextState,
        nextToolState,
      });

      itemCount = foreach.itemCount;
      nextSteps = foreach.nextSteps;
      nextTaskId = foreach.nextTaskId;

      if (foreach.failureNote) {
        return { ok: false, toolKey, note: foreach.failureNote };
      }

      if (foreach.note) note = foreach.note;
    }

    const result = buildToolResult({
      toolKey,
      execution,
      outputType,
      branch: resolved.branch,
      nextTaskId,
      itemCount,
      childQueuedTaskIds,
      note,
      endFlow,
    });

    return {
      ok: true,
      toolKey,
      outcome: {
        result,
        summary: execution.summary ?? note,
        nextState,
        nextToolState,
        nextSteps,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, toolKey, note: `tool error: ${message}` };
  }
}

/** Executes a tool task and enqueues the resulting next step(s). */
export async function processToolStep(
  row: QueuedRow,
  task: TaskRow,
): Promise<void> {
  const execution = await executeToolAttempt(row, task);

  if (!execution.ok) {
    await finishStep(row.id, "failed", {
      toolKey: execution.toolKey,
      note: execution.note,
    });
    return;
  }

  const { result, summary, nextSteps } = execution.outcome;

  if (nextSteps.length > 0) {
    const ids = await enqueueSteps(nextSteps);
    if (Array.isArray(result.childQueuedTaskIds)) {
      result.childQueuedTaskIds = ids;
    }
  }

  await finishStep(row.id, "completed", result, summary);
}
