import { GraphQLError } from "graphql";
import { and, eq, inArray } from "drizzle-orm";
import { db, queuedTasks } from "@repo/db";
import { triggerQueue } from "../../../queue";
import { warmQueuedRows } from "../../../queue/model-warmup";
import {
  createRun,
  getRun,
  reopenStandardRun,
  setRunStatus,
} from "../../../queue/run-store";
import { dismissRun, isRunDismissed, publish } from "../../../queue/step-store";

/**
 * Stops a queued, running, or waiting step and ends its whole run. Returns
 * every step of the run that was completed, so the caller can update them
 * without racing the subscription. The requested step is completed with a
 * "dismissed" result and the remaining unfinished steps are completed too, so
 * no further prompts or steps appear. A running tool call is allowed to finish,
 * but its result is discarded and it cannot continue the run.
 */
export async function dismissQueuedTask(userId: number, queuedTaskId: number) {
  const queuedTask = await db.query.queuedTasks.findFirst({
    where: { id: queuedTaskId },
  });

  if (!queuedTask || queuedTask.queued_by !== userId) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (
    queuedTask.status !== "queued" &&
    queuedTask.status !== "running" &&
    queuedTask.status !== "awaiting_input" &&
    queuedTask.status !== "waiting"
  ) {
    throw new GraphQLError("This run is no longer active", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  // A step that is still executing must not enqueue a continuation after the
  // run has been dismissed.
  dismissRun(queuedTask.runId);

  const activeSteps = await db
    .select()
    .from(queuedTasks)
    .where(
      and(
        eq(queuedTasks.runId, queuedTask.runId),
        inArray(queuedTasks.status, [
          "queued",
          "running",
          "awaiting_input",
          "waiting",
        ]),
      ),
    );

  const dismissedAt = new Date().toISOString();
  const updatedSteps = [];

  const requestedStep = activeSteps.find((step) => step.id === queuedTask.id);
  if (!requestedStep) {
    throw new GraphQLError("This run is no longer active", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  // Mark the run cancelled before completing its steps. A step that is still
  // executing settles in its own finally block, which only touches runs that
  // are still "running".
  await setRunStatus(queuedTask.runId, "cancelled");

  for (const step of activeSteps) {
    const previous =
      typeof step.result === "object" && step.result !== null
        ? (step.result as Record<string, unknown>)
        : {};

    const result = {
      ...previous,
      branch: "none" as const,
      nextTaskId: null,
      dismissed: true,
      dismissedAt,
      summary: "Run stopped by user",
      ...(step.id === queuedTask.id
        ? {}
        : { note: "cancelled because the run was stopped" }),
    };

    const [updated] = await db
      .update(queuedTasks)
      .set({ status: "completed", pendingChoice: null, result })
      .where(eq(queuedTasks.id, step.id))
      .returning();

    if (updated) {
      updatedSteps.push(updated);
      publish(updated, "run stopped by user");
    }
  }

  return updatedSteps;
}

/**
 * Re-queues a failed step with the same task, state, and toolState. A retry of
 * a run that was stopped starts a fresh run so the old dismissal cannot block
 * it. The failed row stays in history; the retry is a new step.
 */
export async function retryQueuedTask(userId: number, queuedTaskId: number) {
  const queuedTask = await db.query.queuedTasks.findFirst({
    where: { id: queuedTaskId },
  });

  if (!queuedTask || queuedTask.queued_by !== userId) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (queuedTask.status !== "failed") {
    throw new GraphQLError("Only failed steps can be retried", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const task = await db.query.tasks.findFirst({
    where: { id: queuedTask.taskId },
  });

  if (!task) {
    throw new GraphQLError("This step's task no longer exists", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  let runId = queuedTask.runId;
  const existingRun = await getRun(runId);
  if (isRunDismissed(runId) || existingRun?.status === "cancelled") {
    const run = await createRun({
      userId: queuedTask.queued_by,
      mode: "standard",
      state: queuedTask.state,
      startTaskId: queuedTask.taskId,
    });
    runId = run.id;
  }

  // Mark the failed row before inserting its replacement so a concurrent
  // branch cannot settle the run as failed in between.
  const previous =
    typeof queuedTask.result === "object" && queuedTask.result !== null
      ? (queuedTask.result as Record<string, unknown>)
      : {};
  await db
    .update(queuedTasks)
    .set({
      result: {
        ...previous,
        retried: true,
        retriedAt: new Date().toISOString(),
      },
    })
    .where(eq(queuedTasks.id, queuedTask.id));

  const [retry] = await db
    .insert(queuedTasks)
    .values({
      taskId: queuedTask.taskId,
      state: queuedTask.state,
      toolState: queuedTask.toolState,
      parentQueuedTaskId: queuedTask.parentQueuedTaskId,
      forkGroupId: queuedTask.forkGroupId,
      forkIndex: queuedTask.forkIndex,
      isJoin: queuedTask.isJoin,
      depth: queuedTask.depth,
      status: "queued",
      runId,
      queued_by: queuedTask.queued_by,
      model: queuedTask.model,
      decisionModel: queuedTask.decisionModel,
    })
    .returning();

  if (retry) {
    // The failed row stays in history, but no longer decides the outcome.
    // Reopen the run so the replacement can settle it again.
    if (runId === queuedTask.runId) {
      await reopenStandardRun(runId);
    }
    void warmQueuedRows([retry]);
  }
  triggerQueue();

  return retry;
}
