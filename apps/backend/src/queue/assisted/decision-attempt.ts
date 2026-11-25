import { recordTrace } from "../../assisted/infrastructure/trace";
import { finishAttempt, type TaskSnapshot } from "../../assisted/attempts";
import { setRunStatus } from "../run-store";
import { awaitStep, finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";
import { executeDecisionAttempt } from "../processors/decision-step";
import { failedRun } from "./attempt-support";
import {
  buildDecisionReview,
  buildDecisionTargetReview,
} from "./reviews";

export interface DecisionAttemptInput {
  row: QueuedRow;
  task: TaskRow;
  attemptId: number;
  snapshot: TaskSnapshot;
}

/** Runs a decision attempt and parks its outcome for review. */
export async function runDecisionAttempt(
  input: DecisionAttemptInput,
): Promise<void> {
  const { row, task, attemptId, snapshot } = input;

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
    await finishAttempt(attemptId, {
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
      attemptId,
      decisionPendingChoice: outcome.pendingChoice ?? null,
    };

    await finishAttempt(attemptId, {
      status: "succeeded",
      afterState: row.state,
      afterToolState: row.toolState,
      result,
    });
    await awaitStep(row.id, review, result, outcome.summary);
    await setRunStatus(row.runId, "awaiting_decision_review");

    await recordTrace({
      runId: row.runId,
      attemptId,
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
    attemptId,
    decisionPendingChoice: outcome.pendingChoice ?? null,
  };

  await finishAttempt(attemptId, {
    status: "succeeded",
    afterState: row.state,
    afterToolState: row.toolState,
    result,
  });
  await awaitStep(row.id, review, result, outcome.summary);
  await setRunStatus(row.runId, "awaiting_decision_review");

  await recordTrace({
    runId: row.runId,
    attemptId,
    kind: "decision.completed",
    payload: {
      answer: outcome.result.answer ?? null,
      confidence: outcome.result.normalizedConfidence ?? null,
      matchedResultId: outcome.result.matchedResultId ?? null,
    },
  });
}
