import { GraphQLError } from "graphql";
import { eq, inArray } from "drizzle-orm";
import { db, stepAttempts, tasks } from "@repo/db";
import type { QueuedRow } from "../../queue/types";
import { inheritedForkFields } from "../../queue/joins";
import {
  claimReviewedStep,
  enqueueSteps,
  finishStep,
  releaseReviewedStepClaim,
} from "../../queue/step-store";
import { setRunStatus } from "../../queue/run-store";
import {
  markAttemptCommitted,
  type AttemptRow,
  type TaskSnapshot,
} from "../attempts";
import type { RevisionProposal } from "../domain/revision";
import {
  assertRevisionFits,
  inspectGraph,
  RevisionGraphError,
} from "../graph-safety";
import {
  badInput,
  commitAttemptWorkspace,
  discardAttemptWorkspace,
  draftTargets,
  insertDraftTasks,
  oldNextTaskId,
  setFallback,
  validateToolDraft,
} from "./revision-support";

export interface InsertionRevisionInput {
  userId: number;
  attempt: AttemptRow;
  runId: string;
  step: QueuedRow;
  snapshot: TaskSnapshot;
  result: Record<string, unknown>;
  proposal: RevisionProposal;
}

/**
 * Applies an `insertBefore` / `insertAfter` / `insertBeforeAndAfter` proposal.
 * The inserted chain is created as private drafts first, validated against the
 * live graph, then welded in after a conditional step claim. Any failure rolls
 * the live edge back and deletes the drafts.
 */
export async function applyInsertionRevision(
  input: InsertionRevisionInput,
): Promise<string> {
  const { userId, attempt, runId, step, snapshot, result, proposal } = input;

  const insertions = proposal.insertions ?? [];
  for (const draft of insertions) {
    if (draft.type !== "tool") {
      throw badInput(
        "Only tool tasks can be inserted. Replace this task if it should become a decision.",
      );
    }
    validateToolDraft(draft);
  }

  const oldNext = oldNextTaskId(snapshot, result);
  const beforeDrafts =
    proposal.kind === "insertBefore"
      ? insertions
      : proposal.kind === "insertBeforeAndAfter"
        ? insertions.slice(0, 1)
        : [];
  const afterDrafts =
    proposal.kind === "insertAfter"
      ? insertions
      : proposal.kind === "insertBeforeAndAfter"
        ? insertions.slice(1)
        : [];

  try {
    await assertRevisionFits({
      stepDepth: step.depth,
      insertionCount: insertions.length,
      currentTaskId: snapshot.task.id,
      currentNextId: oldNext,
      afterRoots: afterDrafts.flatMap((draft) =>
        draftTargets(draft, false),
      ),
    });
    const beforeRoots = beforeDrafts.flatMap((draft) =>
      draftTargets(draft, false),
    );
    if (beforeRoots.length > 0) {
      // Pointing at the current task is expected for an inserted-before draft;
      // this only checks that its other targets exist and stay acyclic.
      await inspectGraph(beforeRoots, new Set());
    }
  } catch (err) {
    if (err instanceof RevisionGraphError) throw badInput(err.message);
    throw err;
  }

  const created = await insertDraftTasks(userId, insertions);
  const createdIds = created.map((task) => task.id);

  const beforeTasks =
    proposal.kind === "insertBefore"
      ? created
      : proposal.kind === "insertBeforeAndAfter"
        ? created.slice(0, 1)
        : [];
  const afterTasks =
    proposal.kind === "insertAfter"
      ? created
      : proposal.kind === "insertBeforeAndAfter"
        ? created.slice(1)
        : [];

  const claimed = await claimReviewedStep(step.id);
  if (!claimed) {
    await db.delete(tasks).where(inArray(tasks.id, createdIds));
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  try {
    if (proposal.kind === "insertAfter") {
      // The current outcome is accepted, then the inserted chain runs. Commit
      // before rewiring so a conflict cannot leave live edges pointing at a
      // chain that will never run.
      await commitAttemptWorkspace(runId, attempt.id, attempt.workspaceKey);
      await markAttemptCommitted(attempt.id);
    } else {
      await discardAttemptWorkspace(runId, attempt.id);
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
    }

    if (beforeTasks.length > 0) {
      for (let index = 0; index < beforeTasks.length - 1; index += 1) {
        await setFallback(beforeTasks[index]!.id, beforeTasks[index + 1]!.id);
      }
      await setFallback(
        beforeTasks[beforeTasks.length - 1]!.id,
        snapshot.task.id,
      );
    }

    if (afterTasks.length > 0) {
      for (let index = 0; index < afterTasks.length - 1; index += 1) {
        await setFallback(afterTasks[index]!.id, afterTasks[index + 1]!.id);
      }
      await setFallback(afterTasks[afterTasks.length - 1]!.id, oldNext);
      await setFallback(snapshot.task.id, afterTasks[0]!.id);
    }

    const insertedTaskIds = afterTasks.map((task) => task.id);

    if (proposal.kind === "insertAfter") {
      await finishStep(
        step.id,
        "completed",
        {
          ...result,
          accepted: true,
          acceptedAt: new Date().toISOString(),
          insertedChain: {
            previousFallback: oldNext,
            insertedTaskIds,
          },
        },
        "step accepted",
      );
    } else {
      await finishStep(
        step.id,
        "completed",
        {
          ...result,
          skipped: true,
          branch: "none",
          nextTaskId: null,
          summary: "Step deferred; running inserted tasks first",
          ...(afterTasks.length > 0
            ? {
                insertedChain: {
                  previousFallback: oldNext,
                  insertedTaskIds,
                },
              }
            : {}),
        },
        "step deferred",
      );
    }
  } catch (err) {
    // Undo the live edge and remove drafts so a failed apply leaves no trace.
    if (afterTasks.length > 0) {
      await setFallback(snapshot.task.id, oldNext).catch(() => undefined);
    }
    await db
      .delete(tasks)
      .where(inArray(tasks.id, createdIds))
      .catch(() => undefined);
    await releaseReviewedStepClaim(step.id).catch(() => undefined);
    throw err;
  }

  const firstInsertion = beforeTasks[0] ?? afterTasks[0];
  if (!firstInsertion) return runId;

  await enqueueSteps([
    {
      taskId: firstInsertion.id,
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

  await setRunStatus(runId, "running");
  const { triggerQueue } = await import("../../queue/processor");
  triggerQueue();
  return runId;
}
