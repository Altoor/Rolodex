import { and, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { db, queuedTasks, tasks } from "@repo/db";
import { triggerQueue } from "./processor";
import { publish } from "./step-store";
import type { QueuedRow } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Answers a runtime next-step gate. Keeps the proposed task when `taskId` is
 * omitted, or runs a different task for this step. The saved flow is not
 * changed; the approved row is re-queued and the queue resumes.
 */
export async function confirmNextStep(
  userId: number,
  queuedTaskId: number,
  taskId?: number | null,
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
    throw new GraphQLError("This step is not waiting for confirmation", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const pending = asRecord(queued.pendingChoice);
  if (pending?.kind !== "nextStep") {
    throw new GraphQLError("This step is not waiting for confirmation", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const nextTaskId = taskId ?? queued.taskId;

  const target = await db.query.tasks.findFirst({
    where: { id: nextTaskId },
  });
  if (!target) {
    throw new GraphQLError("Target task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const summary = `Approved next step "${target.name}"`;

  const [updated] = await db
    .update(queuedTasks)
    .set({
      taskId: nextTaskId,
      status: "queued",
      pendingChoice: null,
      result: null,
      nextStepApproved: true,
    })
    .where(
      and(
        eq(queuedTasks.id, queuedTaskId),
        eq(queuedTasks.status, "awaiting_input"),
      ),
    )
    .returning();

  if (!updated) {
    throw new GraphQLError("This step has already been confirmed", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  publish(updated, summary);
  triggerQueue();
  return updated;
}
