import { GraphQLError } from "graphql";
import { and, eq } from "drizzle-orm";
import { db, queuedTasks, runs, stepAttempts } from "@repo/db";
import {
  completeReviewedStep,
  enqueueSteps,
  publish,
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
import {
  decisionResultLabel,
  type PendingChoice,
} from "../../queue/user-choice";
import { decisionOptionDescription } from "./target-context";

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

  if (attempt.status !== "succeeded") {
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

  // Tool attempts commit their trial workspace first. A failed commit leaves
  // the attempt uncommitted so the user can retry or cancel.
  if (attempt.workspaceKey) {
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

  await markAttemptCommitted(attempt.id);

  // Accepting a revision persists the snapshot; accepting an unchanged
  // attempt writes the same values back, which also promotes draft tasks.
  const { resultIdMap } = await persistSnapshot(
    attempt.taskSnapshot as unknown as TaskSnapshot,
    userId,
  );

  const nextSteps = nextStepsFromResult(attempt.result);
  const persistedMatchedResultId =
    matchedResultId != null ? resultIdMap.get(matchedResultId) : undefined;
  const result = {
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

  await completeReviewedStep(step.id, result, "step accepted");

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
  } else {
    await completeRunIfIdle(run.id);
  }

  return run.id;
}

/** Marks a decision attempt accepted without changing its definition. */
export async function acceptDecision(userId: number, attemptId: number) {
  return acceptAttempt(userId, attemptId);
}

/**
 * Applies a run-only decision override. The chosen result's target is used
 * for this run; the decision rows are untouched.
 */
/**
 * Parks an overridden decision on the target-wiring review instead of failing.
 * The user picked an option that exists but has no next task yet.
 */
async function openDecisionTargetReview(
  attempt: NonNullable<Awaited<ReturnType<typeof getAttempt>>>,
  runId: string,
  result: TaskSnapshot["results"][number],
): Promise<string> {
  const snapshot = attempt.taskSnapshot as unknown as TaskSnapshot;
  const step = await db.query.queuedTasks.findFirst({
    where: { id: attempt.queuedTaskId },
  });
  if (!step || step.status !== "awaiting_input") {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const index = snapshot.results.findIndex((row) => row.id === result.id);
  const label =
    result.option ??
    decisionResultLabel(
      result,
      index >= 0 ? index : 0,
      snapshot.decision?.type ?? result.type,
    );
  const description = decisionOptionDescription(snapshot, result);
  const summary = `Decision "${snapshot.task.name}": "${label}" needs a next task`;

  const base =
    typeof attempt.result === "object" && attempt.result !== null
      ? (attempt.result as Record<string, unknown>)
      : {};
  const rest = { ...base };
  delete rest.note;
  delete rest.unwiredResultId;
  delete rest.unwiredOption;
  delete rest.unwiredOptionDescription;

  const updatedResult = {
    ...rest,
    matchedResultId: result.id,
    nextTaskId: null,
    branch: "unwired",
    unwiredResultId: result.id,
    unwiredOption: label,
    unwiredOptionDescription: description,
    summary,
    note: "This option has no next task yet. Choose an existing task or create a new one.",
  };

  const review: PendingChoice = {
    kind: "assistedDecisionTarget",
    taskId: snapshot.task.id,
    prompt: `The model chose "${label}", but this option has no next task yet.`,
    choiceType: "list",
    acceptLabel: "Continue",
    recommendedOptionId: null,
    options: [],
    createdAt: new Date().toISOString(),
  };

  await db
    .update(stepAttempts)
    .set({ result: updatedResult })
    .where(eq(stepAttempts.id, attempt.id));

  const [updatedStep] = await db
    .update(queuedTasks)
    .set({ pendingChoice: review, result: updatedResult })
    .where(
      and(
        eq(queuedTasks.id, step.id),
        eq(queuedTasks.status, "awaiting_input"),
      ),
    )
    .returning();

  if (!updatedStep) {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  publish(updatedStep, summary);
  await setRunStatus(runId, "awaiting_decision_review");
  await recordTrace({
    runId,
    attemptId: attempt.id,
    kind: "decision.overridden",
    payload: { resultId: result.id, unwired: true },
  });

  return runId;
}

export async function overrideDecision(
  userId: number,
  attemptId: number,
  resultId: number,
) {
  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    throw new GraphQLError("Attempt not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const run = await getRun(attempt.runId);
  if (!run || run.userId !== userId || run.mode !== "assisted") {
    throw new GraphQLError("Attempt not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (!(await isLatestAttempt(attempt))) {
    throw new GraphQLError(
      "A newer attempt replaced this one. Review the latest attempt instead.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const snapshot = attempt.taskSnapshot as unknown as TaskSnapshot;
  if (snapshot?.task?.id == null) {
    throw new GraphQLError("Attempt has no task snapshot", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  // Only results in this attempt's decision are selectable. A global lookup
  // would let a caller wire an unrelated decision result.
  const result = snapshot.results.find((row) => row.id === resultId);

  if (!result) {
    throw new GraphQLError("That option is not part of this decision", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (result.resultTaskId == null) {
    return openDecisionTargetReview(attempt, run.id, result);
  }

  const step = await db.query.queuedTasks.findFirst({
    where: { id: attempt.queuedTaskId },
  });
  if (!step || step.status !== "awaiting_input") {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await db
    .update(stepAttempts)
    .set({ status: "committed", committedAt: new Date() })
    .where(eq(stepAttempts.id, attempt.id));

  // Decision revisions only exist in the attempt snapshot. Overriding is the
  // user's acceptance in the low-confidence case, so persist the snapshot and
  // keep the id of the row they actually picked.
  let persistedResultId = resultId;
  if (
    attempt.cause === "addDecisionOption" ||
    attempt.cause === "optimizeDecision" ||
    attempt.cause === "editDecisionWording"
  ) {
    const { resultIdMap } = await persistSnapshot(snapshot, userId);
    persistedResultId = resultIdMap.get(resultId) ?? resultId;
  }

  await db
    .update(stepAttempts)
    .set({
      review: {
        accepted: true,
        overridden: true,
        resultId: persistedResultId,
        reviewedAt: new Date().toISOString(),
        reviewedBy: userId,
      },
    })
    .where(eq(stepAttempts.id, attempt.id));

  const nextSteps: QueuedStepInsert[] = [
    {
      taskId: result.resultTaskId,
      state: step.state,
      toolState: result.appendState
        ? [...step.toolState, { decision: result.option }]
        : step.toolState,
      depth: step.depth + 1,
      parentQueuedTaskId: step.id,
      runId: step.runId,
      queued_by: step.queued_by,
      model: step.model,
      decisionModel: step.decisionModel,
    },
  ];

  const base =
    typeof attempt.result === "object" && attempt.result !== null
      ? (attempt.result as Record<string, unknown>)
      : {};

  await completeReviewedStep(
    step.id,
    {
      ...base,
      matchedResultId: persistedResultId,
      nextTaskId: result.resultTaskId,
      branch: "result",
      overridden: true,
      summary: `User overrode the decision for this run`,
    },
    "decision overridden for this run",
  );

  await enqueueSteps(nextSteps);
  await setRunStatus(run.id, "running");
  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "decision.overridden",
    payload: { resultId: persistedResultId, nextTaskId: result.resultTaskId },
  });

  const { triggerQueue } = await import("../../queue/processor");
  triggerQueue();
  return run.id;
}

export async function listRunSteps(runId: string) {
  return db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, runId))
    .orderBy(queuedTasks.id);
}

export { runs };
