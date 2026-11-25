import {
  discardTrial,
  type TrialWorkspace,
} from "../assisted/infrastructure/workspace";
import { recordTrace } from "../assisted/infrastructure/trace";
import {
  createAttempt,
  finishAttempt,
  loadTaskSnapshot,
  type TaskSnapshot,
} from "../assisted/attempts";
import { getRun } from "./run-store";
import { finishStep } from "./step-store";
import type { QueuedRow, TaskRow } from "./types";
import { failedRun } from "./assisted/attempt-support";
import { runDecisionAttempt } from "./assisted/decision-attempt";
import { runToolAttempt } from "./assisted/tool-attempt";
import { runUserDecisionAttempt } from "./assisted/user-decision-attempt";

export interface AttemptOptions {
  kind?: "initial" | "revision" | "replay";
  revision?: unknown;
  cause?: string;
}

/**
 * Executes one attempt from a snapshot. It never enqueues a successor: the
 * step is parked for review and an accepted attempt decides what happens
 * next. Revision attempts reuse the same checkpoint (`row` state/toolState).
 */
export async function runAssistedAttempt(
  row: QueuedRow,
  snapshot: TaskSnapshot,
  options: AttemptOptions = {},
): Promise<void> {
  const task = snapshot.task;
  const attempt = await createAttempt({
    row,
    snapshot,
    kind: options.kind ?? "initial",
    revision: options.revision,
    cause: options.cause,
  });

  await recordTrace({
    runId: row.runId,
    attemptId: attempt.id,
    kind: "attempt.started",
    payload: {
      stepId: row.id,
      taskId: task.id,
      taskName: task.name,
      type: task.type,
      attemptNumber: attempt.attemptNumber,
      state: row.state,
      toolState: row.toolState,
      revision: options.revision ?? null,
    },
  });

  let workspace: TrialWorkspace | undefined;

  try {
    if (task.type === "tool") {
      await runToolAttempt({
        row,
        task,
        attemptId: attempt.id,
        onWorkspace: (created) => {
          workspace = created;
        },
      });
      return;
    }

    if (task.type === "decision") {
      await runDecisionAttempt({
        row,
        task,
        attemptId: attempt.id,
        snapshot,
      });
      return;
    }

    if (task.type === "userDecision") {
      await runUserDecisionAttempt({
        row,
        task,
        attemptId: attempt.id,
        snapshot,
      });
      return;
    }

    const note = `task type "${task.type}" is not runnable yet`;
    await finishAttempt(attempt.id, { status: "failed", result: { note } });
    await finishStep(row.id, "failed", { note });
    failedRun(row, note);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // An unexpected failure may happen after the trial was created but before
    // the attempt was parked. Drop the sandbox so retries start clean.
    if (workspace) {
      await discardTrial(workspace).catch(() => undefined);
    }
    await finishAttempt(attempt.id, {
      status: "failed",
      result: { note: `assisted step error: ${message}` },
    });
    await finishStep(row.id, "failed", {
      note: `assisted step error: ${message}`,
    });
    failedRun(row, message);
  }
}

/**
 * Executes one step of an assisted run. The starting step uses the run's
 * snapshot so unsaved builder edits execute without being written to the saved
 * task; revisions and later steps use the snapshot stored on each attempt.
 */
export async function processAssistedStep(
  row: QueuedRow,
  task: TaskRow,
): Promise<void> {
  const run = await getRun(row.runId);
  const isStartStep =
    run?.mode === "assisted" &&
    row.parentQueuedTaskId == null &&
    run.startTaskId === task.id;

  const snapshot =
    isStartStep && run?.startTaskSnapshot
      ? (run.startTaskSnapshot as unknown as TaskSnapshot)
      : await loadTaskSnapshot(task);

  await runAssistedAttempt(row, snapshot);
}
