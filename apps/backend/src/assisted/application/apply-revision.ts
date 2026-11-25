import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db, stepAttempts, tasks } from "@repo/db";
import { inheritedForkFields } from "../../queue/joins";
import { completeRunIfIdle, getRun, setRunStatus } from "../../queue/run-store";
import {
  claimReviewedStep,
  enqueueSteps,
  finishStep,
  releaseReviewedStepClaim,
  resumeReviewedStep,
} from "../../queue/step-store";
import { runAssistedAttempt } from "../../queue/assisted-step";
import {
  getAttempt,
  isLatestAttempt,
  supersedeAttempt,
  taskFromSnapshot,
} from "../attempts";
import {
  validateRevisionProposal,
  type RevisionProposal,
} from "../domain/revision";
import { recordTrace } from "../infrastructure/trace";
import { assertRevisionFits, RevisionGraphError } from "../graph-safety";
import { applyInsertionRevision } from "./apply-insertion-revision";
import {
  badInput,
  buildReplacementSnapshot,
  discardAttemptWorkspace,
  draftTargets,
  oldNextTaskId,
  resultOf,
  snapshotOf,
  validateToolConfigFor,
  validateToolDraft,
} from "./revision-support";

/**
 * Applies one validated repair proposal. Every branch starts a new attempt
 * from the original checkpoint; nothing from the rejected attempt is reused.
 */
export async function applyStepRevision(
  userId: number,
  attemptId: number,
  rawProposal: unknown,
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

  const step = await db.query.queuedTasks.findFirst({
    where: { id: attempt.queuedTaskId },
  });
  if (!step || step.status !== "awaiting_input") {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (!(await isLatestAttempt(attempt))) {
    throw new GraphQLError(
      "A newer attempt replaced this one. Revise the latest attempt instead.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const proposal: RevisionProposal = validateRevisionProposal(rawProposal);
  const snapshot = snapshotOf(attempt);
  const result = resultOf(attempt);

  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "revision.applied",
    payload: proposal as unknown as Record<string, unknown>,
  });

  if (proposal.kind === "updateToolConfig") {
    validateToolConfigFor(
      snapshot.task.toolKey,
      proposal.taskPatch?.toolConfig ?? null,
    );
    const task = {
      ...taskFromSnapshot(snapshot),
      toolConfig: proposal.taskPatch?.toolConfig ?? null,
    };
    // The revised attempt replaces the rejected one; its trial is no longer
    // acceptable and must not linger.
    await discardAttemptWorkspace(run.id, attempt.id);
    await supersedeAttempt(attempt.id, "tool configuration revised");
    const resumed = await resumeReviewedStep(step.id);
    if (!resumed) {
      throw new GraphQLError("This attempt is not waiting for review", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    await runAssistedAttempt(
      resumed,
      { ...snapshot, task },
      { kind: "revision", revision: proposal, cause: "updateToolConfig" },
    );
    return run.id;
  }

  if (proposal.kind === "replaceTask") {
    const replacement = proposal.replacement!;
    validateToolDraft(replacement);

    try {
      await assertRevisionFits({
        stepDepth: step.depth,
        insertionCount: 0,
        currentTaskId: snapshot.task.id,
        currentNextId: null,
        replacement: true,
        replacementRoots: draftTargets(replacement),
      });
    } catch (err) {
      if (err instanceof RevisionGraphError) throw badInput(err.message);
      throw err;
    }

    const replacementSnapshot = buildReplacementSnapshot(snapshot, replacement);
    await discardAttemptWorkspace(run.id, attempt.id);
    await supersedeAttempt(attempt.id, "task replaced");
    const resumed = await resumeReviewedStep(step.id);
    if (!resumed) {
      throw new GraphQLError("This attempt is not waiting for review", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    await runAssistedAttempt(
      resumed,
      replacementSnapshot,
      { kind: "revision", revision: proposal, cause: "replaceTask" },
    );
    return run.id;
  }
  if (proposal.kind === "runNext") {
    const target =
      proposal.nextTaskId ?? oldNextTaskId(snapshot, result) ?? null;
    if (target == null) {
      throw new GraphQLError(
        "This step has no next task. Add or wire a target first.",
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }

    const claimed = await claimReviewedStep(step.id);
    if (!claimed) {
      throw new GraphQLError("This attempt is not waiting for review", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    try {
      await discardAttemptWorkspace(run.id, attempt.id);
      await db
        .update(stepAttempts)
        .set({
          status: "committed",
          review: {
            accepted: true,
            skipped: true,
            reviewedAt: new Date().toISOString(),
            reviewedBy: userId,
          },
          committedAt: new Date(),
        })
        .where(eq(stepAttempts.id, attempt.id));

      await finishStep(
        step.id,
        "completed",
        {
          ...result,
          skipped: true,
          branch: "none",
          nextTaskId: null,
          summary: "Step skipped; running the next task",
        },
        "step skipped",
      );
    } catch (err) {
      await releaseReviewedStepClaim(step.id);
      throw err;
    }

    const ids = await enqueueSteps([
      {
        taskId: target,
        state: step.state,
        toolState: step.toolState,
        depth: step.depth + 1,
        parentQueuedTaskId: step.id,
        runId: step.runId,
        queued_by: step.queued_by,
        model: step.model,
        decisionModel: step.decisionModel,
        ...inheritedForkFields(step),
      },
    ]);
    await setRunStatus(run.id, "running");
    const settled = await completeRunIfIdle(run.id);
    if (ids.length > 0 || !settled) {
      const { triggerQueue } = await import("../../queue/processor");
      triggerQueue();
    }
    return run.id;
  }

  return applyInsertionRevision({
    userId,
    attempt,
    runId: run.id,
    step,
    snapshot,
    result,
    proposal,
  });
}

export { tasks };
