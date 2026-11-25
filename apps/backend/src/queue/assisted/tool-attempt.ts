import { getToolDefinition } from "@repo/tools";
import {
  beginTrial,
  discardTrial,
  runInTrial,
  type TrialWorkspace,
} from "../../assisted/infrastructure/workspace";
import { recordTrace } from "../../assisted/infrastructure/trace";
import { finishAttempt } from "../../assisted/attempts";
import { setRunStatus } from "../run-store";
import { awaitStep, finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";
import type { PendingChoice } from "../user-choice";
import { executeToolAttempt } from "../processors/tool-step";
import { failedRun } from "./attempt-support";

export interface ToolAttemptInput {
  row: QueuedRow;
  task: TaskRow;
  attemptId: number;
  /** Lets the caller discard the trial if an unexpected error escapes. */
  onWorkspace: (workspace: TrialWorkspace) => void;
}

/** Runs a tool inside a trial workspace and parks the outcome for review. */
export async function runToolAttempt(input: ToolAttemptInput): Promise<void> {
  const { row, task, attemptId, onWorkspace } = input;

  // A tool that declares itself unsafe cannot be rolled back by the trial, so
  // refuse before it runs rather than presenting a false sandbox.
  const definition = task.toolKey
    ? getToolDefinition(task.toolKey)
    : undefined;
  if (definition?.trialSafe === false) {
    const note = `tool "${definition.key}" cannot run inside an assisted trial`;
    await finishAttempt(attemptId, {
      status: "failed",
      result: { note, toolKey: definition.key },
    });
    await finishStep(row.id, "failed", {
      toolKey: definition.key,
      note,
    });
    failedRun(row, note);
    return;
  }

  const trial = await beginTrial(row.runId, attemptId);
  onWorkspace(trial);
  const execution = await runInTrial(trial, () =>
    executeToolAttempt(row, task),
  );

  if (!execution.ok) {
    await discardTrial(trial);
    await finishAttempt(attemptId, {
      status: "failed",
      result: { note: execution.note, toolKey: execution.toolKey },
    });
    await finishStep(row.id, "failed", {
      toolKey: execution.toolKey,
      note: execution.note,
    });
    failedRun(row, execution.note);
    return;
  }

  const { outcome } = execution;
  const review: PendingChoice = {
    kind: "assistedToolReview",
    taskId: task.id,
    prompt: "Is this outcome acceptable?",
    choiceType: "list",
    acceptLabel: "Accept step",
    options: [],
    createdAt: new Date().toISOString(),
  };

  const result = {
    ...outcome.result,
    summary: outcome.summary,
    nextSteps: outcome.nextSteps,
    workspaceKey: trial.workspaceKey,
    attemptId,
  };

  await finishAttempt(attemptId, {
    status: "succeeded",
    afterState: outcome.nextState,
    afterToolState: outcome.nextToolState,
    result,
    effectJournal: { workspaceKey: trial.workspaceKey },
    workspaceKey: trial.workspaceKey,
  });
  await awaitStep(row.id, review, result, outcome.summary);
  await setRunStatus(row.runId, "awaiting_step_review");

  await recordTrace({
    runId: row.runId,
    attemptId,
    kind: "attempt.succeeded",
    payload: {
      summary: outcome.summary,
      nextStepCount: outcome.nextSteps.length,
      effects: { workspaceKey: trial.workspaceKey },
    },
  });
}
