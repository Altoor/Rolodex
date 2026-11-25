import { GraphQLError } from "graphql";
import { db } from "@repo/db";
import {
  claimReviewedStep,
  enqueueSteps,
  finishStep,
  releaseReviewedStepClaim,
} from "../../queue/step-store";
import {
  completeRunIfIdle,
  getRun,
  setRunStatus,
} from "../../queue/run-store";
import type { queuedTasks as QueuedTasksTable } from "@repo/db";
import {
  getAttempt,
  isLatestAttempt,
  markAttemptCommitted,
  persistSnapshot,
  type TaskSnapshot,
} from "../attempts";
import {
  commitTrial,
  resumeTrial,
  TrialCommitConflictError,
} from "../infrastructure/workspace";
import { ASSISTED_CONFIDENCE_FLOOR } from "../domain/decision";
import { recordTrace } from "../infrastructure/trace";

type QueuedStepInsert = typeof QueuedTasksTable.$inferInsert;

function nextStepsFromResult(result: unknown): QueuedStepInsert[] {
  if (!result || typeof result !== "object") return [];
  const value = (result as { nextSteps?: unknown }).nextSteps;
  return Array.isArray(value) ? (value as QueuedStepInsert[]) : [];
}

/** Commits the accepted attempt's effects and continues the run. */
export async function acceptAttempt(userId: number, attemptId: number) {
  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    throw new GraphQLError("Attempt not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const run = await getRun(attempt.runId);
  if (!run || run.userId !== userId) {
    throw new GraphQLError("Attempt not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (run.mode !== "assisted") {
    throw new GraphQLError("Only assisted attempts can be reviewed", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const step = await db.query.queuedTasks.findFirst({
    where: { id: attempt.queuedTaskId },
  });
  if (!step || step.status !== "awaiting_input") {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (attempt.status !== "succeeded" && attempt.status !== "committed") {
    throw new GraphQLError("This attempt cannot be accepted", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (!(await isLatestAttempt(attempt))) {
    throw new GraphQLError(
      "A newer attempt replaced this one. Review the latest attempt instead.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const snapshot = attempt.taskSnapshot as unknown as TaskSnapshot | null;
  const resultRecord =
    typeof attempt.result === "object" && attempt.result !== null
      ? (attempt.result as Record<string, unknown>)
      : {};
  const matchedResultId =
    typeof resultRecord.matchedResultId === "number"
      ? resultRecord.matchedResultId
      : null;
  const normalizedConfidence =
    typeof resultRecord.normalizedConfidence === "number"
      ? resultRecord.normalizedConfidence
      : null;

  // Assisted decisions are never accepted on low confidence or a missing
  // match; the user must override to an option explicitly.
  if (snapshot?.task.type === "decision") {
    if (matchedResultId == null) {
      throw new GraphQLError(
        normalizedConfidence != null &&
          normalizedConfidence < ASSISTED_CONFIDENCE_FLOOR
          ? `The model's confidence (${normalizedConfidence.toFixed(2)}) is below 0.8. Pick the option that should have won before continuing.`
          : "The model did not match an option. Pick the option that should have won before continuing.",
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
    if (
      normalizedConfidence != null &&
      normalizedConfidence < ASSISTED_CONFIDENCE_FLOOR
    ) {
      throw new GraphQLError(
        `The model's confidence (${normalizedConfidence.toFixed(2)}) is below 0.8. Pick the option that should have won before continuing.`,
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
  }

  // A decision option that has no target cannot continue. The user must wire
  // or create one first, even if they explicitly accept the model's choice.
  if (snapshot && matchedResultId != null) {
    const matched = snapshot.results.find(
      (row) => row.id === matchedResultId,
    );
    if (!matched) {
      throw new GraphQLError(
        "That option is not part of this decision. Pick an option from the review.",
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
    if (matched.resultTaskId == null) {
      throw new GraphQLError(
        "That option has no next task. Choose or create a target before continuing.",
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
  }

  // Claim the review transition first: a concurrent accept loses here and must
  // not enqueue a second copy of the next steps.
  const claimed = await claimReviewedStep(step.id);
  if (!claimed) {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const nextSteps = nextStepsFromResult(attempt.result);

  let result: Record<string, unknown>;
  try {
    // Tool attempts commit their trial workspace first. A failed commit leaves
    // the attempt uncommitted so the user can retry or cancel. A retry after a
    // crash following `markAttemptCommitted` skips the now-discarded workspace.
    if (attempt.workspaceKey && attempt.status !== "committed") {
      const workspace = await resumeTrial(run.id, attempt.id);
      try {
        await commitTrial(workspace);
      } catch (err) {
        if (err instanceof TrialCommitConflictError) {
          throw new GraphQLError(err.message, {
            extensions: { code: "CONFLICT" },
          });
        }
        throw err;
      }
    }

    // Conditional so a retry after a crash between the trial commit and this
    // update can finish the remaining work without re-committing.
    await markAttemptCommitted(attempt.id);

    // Accepting a revision persists the snapshot; accepting an unchanged
    // attempt writes the same values back, which also promotes draft tasks.
    const { resultIdMap } = await persistSnapshot(
      attempt.taskSnapshot as unknown as TaskSnapshot,
      userId,
    );

    const persistedMatchedResultId =
      matchedResultId != null ? resultIdMap.get(matchedResultId) : undefined;
    result = {
      ...(typeof attempt.result === "object" && attempt.result !== null
        ? attempt.result
        : {}),
      ...(persistedMatchedResultId != null
        ? { matchedResultId: persistedMatchedResultId }
        : {}),
      accepted: true,
      acceptedAt: new Date().toISOString(),
      acceptedBy: userId,
    };

    await finishStep(step.id, "completed", result, "step accepted");
  } catch (err) {
    await releaseReviewedStepClaim(step.id);
    throw err;
  }

  const inserted = nextSteps.length > 0 ? await enqueueSteps(nextSteps) : [];

  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "attempt.accepted",
    payload: { nextStepCount: inserted.length, stepId: step.id },
  });

  if (inserted.length > 0) {
    await setRunStatus(run.id, "running");
    const { triggerQueue } = await import("../../queue/processor");
    triggerQueue();
  }

  // Releases a join barrier when this was the last branch, and settles the run
  // when no queued step remains. A newly released join needs the queue loop.
  const settled = await completeRunIfIdle(run.id);
  if (!settled) {
    const { triggerQueue } = await import("../../queue/processor");
    triggerQueue();
  }

  return run.id;
}

export { overrideDecision } from "./override-decision";
