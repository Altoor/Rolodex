import { db } from "@repo/db";
import { getToolDefinition } from "@repo/tools";
import {
  beginTrial,
  discardTrial,
  runInTrial,
  type TrialWorkspace,
} from "../assisted/infrastructure/workspace";
import { recordTrace } from "../assisted/infrastructure/trace";
import {
  createAttempt,
  finishAttempt,
  loadTaskSnapshot,
  type TaskSnapshot,
} from "../assisted/attempts";
import { getRun, setRunStatus } from "./run-store";
import { awaitStep, finishStep } from "./step-store";
import type { QueuedRow, TaskRow } from "./types";
import type { PendingChoice, PendingChoiceOption } from "./user-choice";
import { executeDecisionAttempt } from "./processors/decision-step";
import { executeToolAttempt } from "./processors/tool-step";
import { processUserDecisionStep } from "./processors/user-decision-step";
import { decisionResultLabel } from "./user-choice";

function failedRun(row: QueuedRow, note: string): void {
  void setRunStatus(row.runId, "failed");
  void recordTrace({
    runId: row.runId,
    kind: "step.failed",
    payload: { note, stepId: row.id },
  });
}

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
      // A tool that declares itself unsafe cannot be rolled back by the trial,
      // so refuse before it runs rather than presenting a false sandbox.
      const definition = task.toolKey
        ? getToolDefinition(task.toolKey)
        : undefined;
      if (definition?.trialSafe === false) {
        const note = `tool "${definition.key}" cannot run inside an assisted trial`;
        await finishAttempt(attempt.id, {
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

      const trial = await beginTrial(row.runId, attempt.id);
      workspace = trial;
      const execution = await runInTrial(trial, () =>
        executeToolAttempt(row, task),
      );

      if (!execution.ok) {
        await discardTrial(trial);
        workspace = undefined;
        await finishAttempt(attempt.id, {
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
        attemptId: attempt.id,
      };

      await finishAttempt(attempt.id, {
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
        attemptId: attempt.id,
        kind: "attempt.succeeded",
        payload: {
          summary: outcome.summary,
          nextStepCount: outcome.nextSteps.length,
          effects: { workspaceKey: trial.workspaceKey },
        },
      });
      return;
    }

    if (task.type === "decision") {
      const execution = await executeDecisionAttempt(
        row,
        task,
        {
          decision: snapshot.decision,
          results: snapshot.results,
        },
        { allowUnwiredMatch: true },
      );

      if (!execution.ok) {
        await finishAttempt(attempt.id, {
          status: "failed",
          result: { note: execution.note },
        });
        await finishStep(row.id, "failed", { note: execution.note });
        failedRun(row, execution.note);
        return;
      }

      const { outcome } = execution;

      if (outcome.status === "awaiting_target") {
        const review = buildDecisionTargetReview(task, outcome);
        const result = {
          ...outcome.result,
          nextSteps: [],
          attemptId: attempt.id,
          decisionPendingChoice: outcome.pendingChoice ?? null,
        };

        await finishAttempt(attempt.id, {
          status: "succeeded",
          afterState: row.state,
          afterToolState: row.toolState,
          result,
        });
        await awaitStep(row.id, review, result, outcome.summary);
        await setRunStatus(row.runId, "awaiting_decision_review");

        await recordTrace({
          runId: row.runId,
          attemptId: attempt.id,
          kind: "decision.completed",
          payload: {
            answer: outcome.result.answer ?? null,
            confidence: outcome.result.normalizedConfidence ?? null,
            matchedResultId: outcome.result.matchedResultId ?? null,
            unwiredResultId: outcome.result.unwiredResultId ?? null,
          },
        });
        return;
      }

      const review = await buildDecisionReview(task, outcome.result, snapshot);
      const result = {
        ...outcome.result,
        nextSteps: outcome.nextSteps,
        attemptId: attempt.id,
        decisionPendingChoice: outcome.pendingChoice ?? null,
      };

      await finishAttempt(attempt.id, {
        status: "succeeded",
        afterState: row.state,
        afterToolState: row.toolState,
        result,
      });
      await awaitStep(row.id, review, result, outcome.summary);
      await setRunStatus(row.runId, "awaiting_decision_review");

      await recordTrace({
        runId: row.runId,
        attemptId: attempt.id,
        kind: "decision.completed",
        payload: {
          answer: outcome.result.answer ?? null,
          confidence: outcome.result.normalizedConfidence ?? null,
          matchedResultId: outcome.result.matchedResultId ?? null,
        },
      });
      return;
    }

    if (task.type === "userDecision") {
      const parked = await processUserDecisionStep(
        row,
        task,
        snapshot.userDecisionOptions,
      );

      if (!parked) {
        await finishAttempt(attempt.id, {
          status: "failed",
          result: { note: "user decision has no options for this run" },
        });
        failedRun(row, "user decision has no options for this run");
        return;
      }

      // The attempt has produced its pending choice; answering it marks the
      // attempt committed. Leaving it running would make history/cancel treat
      // an already parked decision as in-flight.
      await finishAttempt(attempt.id, {
        status: "succeeded",
        afterState: row.state,
        afterToolState: row.toolState,
        result: parked.result,
      });
      await setRunStatus(row.runId, "awaiting_user_choice");
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

async function buildDecisionReview(
  task: TaskRow,
  result: Record<string, unknown>,
  snapshot?: TaskSnapshot,
): Promise<PendingChoice> {
  const results = (
    snapshot?.results ??
    (await db.query.taskResults.findMany({ where: { taskId: task.id } }))
  ).sort((a, b) => a.id - b.id);

  const options: PendingChoiceOption[] = results.map((entry, index) => ({
    id: `result:${entry.id}`,
    label: decisionResultLabel(entry, index, entry.type),
    value: entry.option ?? entry.scoreThreshold ?? entry.probabilityThreshold,
    resultTaskId: entry.resultTaskId,
    appendState: entry.appendState,
    source: "decisionResult" as const,
  }));

  const chosen = result.matchedResultId
    ? options.find((option) => option.id === `result:${result.matchedResultId}`)
    : undefined;
  const needsChoice = chosen == null || result.lowConfidence === true;

  return {
    kind: "assistedDecisionReview",
    taskId: task.id,
    prompt: needsChoice
      ? "The model did not make a confident match. Pick the option that should have won."
      : "Is this the right choice?",
    choiceType: "list",
    acceptLabel: needsChoice ? "Pick an option" : "Yes, use this choice",
    recommendedOptionId: chosen?.id ?? null,
    options,
    createdAt: new Date().toISOString(),
  };
}

function buildDecisionTargetReview(
  task: TaskRow,
  outcome: { result: Record<string, unknown> },
): PendingChoice {
  const option =
    typeof outcome.result.unwiredOption === "string" &&
    outcome.result.unwiredOption.trim()
      ? outcome.result.unwiredOption
      : "This choice";

  return {
    kind: "assistedDecisionTarget",
    taskId: task.id,
    prompt: `The model chose "${option}", but this option has no next task yet.`,
    choiceType: "list",
    acceptLabel: "Continue",
    recommendedOptionId: null,
    options: [],
    createdAt: new Date().toISOString(),
  };
}
