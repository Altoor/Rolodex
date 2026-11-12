import { GraphQLError } from "graphql";
import { and, eq } from "drizzle-orm";
import { db, queuedTasks } from "@repo/db";
import { MAX_CHAIN_DEPTH } from "./constants";
import { enqueueStep, publish } from "./step-store";
import type { QueuedRow } from "./types";
import type { PendingChoice, PendingChoiceOption } from "./user-choice";
import { triggerQueue } from "./processor";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readPendingChoice(value: unknown): PendingChoice {
  const pending = asRecord(value);
  if (!pending || !Array.isArray(pending.options)) {
    throw new GraphQLError("QueuedTask is not waiting for a valid choice", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return pending as unknown as PendingChoice;
}

/** Answers a waiting choice, completes the step and resumes the chain. */
export async function answerUserDecision(
  userId: number,
  queuedTaskId: number,
  optionId: string,
): Promise<QueuedRow> {
  const queued = await db.query.queuedTasks.findFirst({
    where: { id: queuedTaskId },
  });

  if (!queued) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (queued.queued_by !== userId) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (queued.status !== "awaiting_input") {
    throw new GraphQLError("This choice is not waiting for an answer", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const pending = readPendingChoice(queued.pendingChoice);
  const option: PendingChoiceOption | undefined = pending.options.find(
    (candidate) => candidate.id === optionId,
  );

  if (!option) {
    throw new GraphQLError("Unknown choice option", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  let nextTaskId = option.resultTaskId;
  let note: string | undefined;

  if (nextTaskId == null) {
    note = "selection had no target task — run finished";
  }

  // The task may have been deleted while the run was waiting.
  if (nextTaskId != null) {
    const target = await db.query.tasks.findFirst({
      where: { id: nextTaskId },
    });
    if (!target) {
      note = `target task ${nextTaskId} no longer exists — run finished`;
      nextTaskId = null;
    }
  }

  let enqueueNext = nextTaskId != null;
  if (enqueueNext && queued.depth >= MAX_CHAIN_DEPTH) {
    enqueueNext = false;
    const maxNote = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
    note = note ? `${note}; ${maxNote}` : maxNote;
  }

  const appendValue =
    option.source === "decisionResult"
      ? { decision: option.value }
      : option.value;

  const nextToolState = option.appendState
    ? [...queued.toolState, appendValue]
    : queued.toolState;

  const summary = `User chose "${option.label}"`;
  const previous = asRecord(queued.result) ?? {};

  const result = {
    ...previous,
    answer: option.value,
    selectedOptionId: option.id,
    selectedBy: "user",
    branch: nextTaskId != null ? "result" : "none",
    nextTaskId,
    summary,
    ...(note ? { note } : {}),
  };

  // A conditional update makes double-clicks and concurrent tabs safe.
  const [updated] = await db
    .update(queuedTasks)
    .set({
      status: "completed",
      result,
      pendingChoice: null,
    })
    .where(
      and(
        eq(queuedTasks.id, queuedTaskId),
        eq(queuedTasks.status, "awaiting_input"),
      ),
    )
    .returning();

  if (!updated) {
    throw new GraphQLError("This choice has already been answered", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  publish(updated, summary);

  if (enqueueNext && nextTaskId != null) {
    await enqueueStep({
      taskId: nextTaskId,
      state: queued.state,
      toolState: nextToolState,
      depth: queued.depth + 1,
      parentQueuedTaskId: queued.id,
      runId: queued.runId,
      queued_by: queued.queued_by,
      model: queued.model,
      decisionModel: queued.decisionModel,
    });
  }

  triggerQueue();
  return updated;
}
