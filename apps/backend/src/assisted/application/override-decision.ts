import { GraphQLError } from "graphql";
import { and, eq } from "drizzle-orm";
import { db, queuedTasks, runs, stepAttempts } from "@repo/db";
import { inheritedForkFields } from "../../queue/joins";
import {
  claimReviewedStep,
  enqueueSteps,
  finishStep,
  publish,
  releaseReviewedStepClaim,
} from "../../queue/step-store";
import { setRunStatus } from "../../queue/run-store";
import { getRun } from "../../queue/run-store";
import type { queuedTasks as QueuedTasksTable } from "@repo/db";
import {
  getAttempt,
  isLatestAttempt,
  persistSnapshot,
  type TaskSnapshot,
} from "../attempts";
import { recordTrace } from "../infrastructure/trace";
import {
  decisionResultLabel,
  type PendingChoice,
} from "../../queue/user-choice";
import { decisionOptionDescription } from "./target-context";

type QueuedStepInsert = typeof QueuedTasksTable.$inferInsert;

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

  const claimed = await claimReviewedStep(step.id);
  if (!claimed) {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  let persistedResultId = resultId;
  try {
    // Decision revisions only exist in the attempt snapshot. Overriding is the
    // user's acceptance in the low-confidence case, so persist the snapshot and
    // keep the id of the row they actually picked.
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
        status: "committed",
        committedAt: new Date(),
        review: {
          accepted: true,
          overridden: true,
          resultId: persistedResultId,
          reviewedAt: new Date().toISOString(),
          reviewedBy: userId,
        },
      })
      .where(eq(stepAttempts.id, attempt.id));

    const base =
      typeof attempt.result === "object" && attempt.result !== null
        ? (attempt.result as Record<string, unknown>)
        : {};

    await finishStep(
      step.id,
      "completed",
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
  } catch (err) {
    await releaseReviewedStepClaim(step.id);
    throw err;
  }

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
      ...inheritedForkFields(step),
    },
  ];

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
