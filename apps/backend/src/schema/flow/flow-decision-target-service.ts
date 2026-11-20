import { and, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { db, queuedTasks, taskResults, tasks } from "@repo/db";
import { MAX_CHAIN_DEPTH } from "../../queue/constants";
import { triggerQueue } from "../../queue/processor";
import { enqueueStep, publish } from "../../queue/step-store";
import type { QueuedRow } from "../../queue/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Wires the unwired decision result that paused a run, then resumes the chain
 * from the chosen target task. The result row is updated too, so future runs
 * can take the same branch automatically.
 */
export async function wireDecisionResultTarget(
  userId: number,
  queuedTaskId: number,
  resultId: number,
  targetTaskId: number,
): Promise<QueuedRow> {
  const queued = await db.query.queuedTasks.findFirst({
    where: { id: queuedTaskId },
  });

  if (!queued || queued.queued_by !== userId) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (queued.status !== "awaiting_input") {
    throw new GraphQLError("This decision is not waiting for a next task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const pending = asRecord(queued.pendingChoice);
  if (pending?.kind !== "decisionTarget") {
    throw new GraphQLError("This step is not waiting for a next task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (queued.taskId == null) {
    throw new GraphQLError("The decision task no longer exists", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const target = await db.query.tasks.findFirst({
    where: { id: targetTaskId },
  });
  if (!target) {
    throw new GraphQLError("Target task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const result = await db.query.taskResults.findFirst({
    where: { id: resultId, taskId: queued.taskId },
  });
  if (!result) {
    throw new GraphQLError("Decision result not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (result.resultTaskId != null) {
    throw new GraphQLError("This decision result already has a target task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await db
    .update(taskResults)
    .set({ resultTaskId: targetTaskId })
    .where(eq(taskResults.id, result.id));

  const previous = asRecord(queued.result) ?? {};
  const {
    note: _note,
    unwiredResultId: _unwiredResultId,
    unwiredOption: _unwiredOption,
    unwiredOptionDescription: _unwiredOptionDescription,
    ...rest
  } = previous;

  let enqueueNext = true;
  let note: string | undefined;
  if (queued.depth >= MAX_CHAIN_DEPTH) {
    enqueueNext = false;
    note = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
  }

  const effectiveAnswer = previous.effectiveAnswer ?? null;
  const nextToolState = result.appendState
    ? [...queued.toolState, { decision: effectiveAnswer }]
    : queued.toolState;
  const summary = `Wired the next step to "${target.name}"`;

  const [updated] = await db
    .update(queuedTasks)
    .set({
      status: "completed",
      pendingChoice: null,
      result: {
        ...rest,
        branch: "result",
        matchedResultId: result.id,
        nextTaskId: targetTaskId,
        selectedBy: "user",
        summary,
        ...(note ? { note } : {}),
      },
    })
    .where(
      and(
        eq(queuedTasks.id, queuedTaskId),
        eq(queuedTasks.status, "awaiting_input"),
      ),
    )
    .returning();

  if (!updated) {
    throw new GraphQLError("This decision has already been wired", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  publish(updated, summary);

  if (enqueueNext) {
    await enqueueStep({
      taskId: targetTaskId,
      state: queued.state,
      toolState: nextToolState,
      depth: queued.depth + 1,
      parentQueuedTaskId: queued.id,
      runId: queued.runId,
      queued_by: queued.queued_by,
      model: queued.model,
      decisionModel: queued.decisionModel,
      // The user just picked this target, so the runtime gate should not ask
      // about the same step again.
      nextStepApproved: true,
    });
  }

  triggerQueue();
  return updated;
}
