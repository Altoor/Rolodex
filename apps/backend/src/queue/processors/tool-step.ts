import { getDecisionModelForUser, getModelForUser } from "@repo/ai";
import { MAX_CHAIN_DEPTH } from "../constants";
import { finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";
import { applyToolState } from "./tool-step/apply-tool-state";
import { buildToolResult } from "./tool-step/build-tool-result";
import { enqueueForeach } from "./tool-step/enqueue-foreach";
import { enqueueNormalNext } from "./tool-step/enqueue-normal";
import { resolveToolBranch } from "./tool-step/resolve-tool-branch";
import { validateToolStep } from "./tool-step/validate-tool";

/** Executes a tool task and enqueues the resulting next step(s). */
export async function processToolStep(
  row: QueuedRow,
  task: TaskRow,
): Promise<void> {
  const validation = validateToolStep(task);
  if (!validation.ok) {
    await finishStep(row.id, "failed", {
      toolKey: validation.toolKey,
      note: validation.note,
    });
    return;
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
      // Selector override > task model > user default, independently for each
      // model role.
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
    let nextTaskId = resolved.nextTaskId;
    let note = resolved.note;
    let childQueuedTaskIds: number[] = [];
    let itemCount: number | undefined;

    if (outputType === "normal") {
      if (nextTaskId != null) {
        if (row.depth >= MAX_CHAIN_DEPTH) {
          nextTaskId = null;
          note = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
        } else {
          await enqueueNormalNext({
            row,
            execution,
            nextTaskId,
            nextState,
            nextToolState,
          });
        }
      }
    } else {
      const foreach = await enqueueForeach({
        row,
        execution,
        nextTaskId,
        nextState,
        nextToolState,
      });

      itemCount = foreach.itemCount;
      childQueuedTaskIds = foreach.childQueuedTaskIds;
      nextTaskId = foreach.nextTaskId;

      if (foreach.failureNote) {
        await finishStep(row.id, "failed", {
          toolKey,
          note: foreach.failureNote,
        });
        return;
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
    });

    await finishStep(row.id, "completed", result, execution.summary ?? note);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishStep(row.id, "failed", {
      toolKey,
      note: `tool error: ${message}`,
    });
  }
}
