import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, queuedTasks } from "@repo/db";
import { getUserSettings } from "../../user/user-settings-service";
import { triggerQueue } from "../../../queue";
import { dismissRun, publish } from "../../../queue/step-store";

export interface CreateQueuedTaskInput {
  taskId?: number | null;
  state: string;
}

export async function createQueuedTask(
  userId: number,
  input: CreateQueuedTaskInput,
) {
  const settings = await getUserSettings(userId);
  const resolvedTaskId = input.taskId ?? settings.defaultTaskId;

  if (resolvedTaskId == null) {
    throw new GraphQLError(
      "No starting task selected and no default task configured",
      {
        extensions: { code: "BAD_USER_INPUT" },
      },
    );
  }

  const queuedTask = {
    taskId: resolvedTaskId,
    state: input.state,
    toolState: [],
    depth: 0,
    // A new user submission starts a new chain run.
    runId: randomUUID(),
    queued_by: userId,
  };

  const [created] = await db.insert(queuedTasks).values(queuedTask).returning();

  // Start the queue if it is idle (the loop is a no-op otherwise).
  triggerQueue();

  return created;
}

export async function completeQueuedTask(id: number) {
  const queuedTask = await db.query.queuedTasks.findFirst({ where: { id } });

  if (!queuedTask) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const [updated] = await db
    .update(queuedTasks)
    .set({ status: "completed" })
    .where(eq(queuedTasks.id, id))
    .returning();
  return updated;
}

/**
 * Dismisses a waiting choice and ends its whole run. Returns every step of the
 * run that was completed, so the caller can update them without racing the
 * subscription. The waiting step is completed with a "dismissed" result and
 * the remaining unfinished steps are completed too, so no further prompts or
 * steps appear.
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

  if (queuedTask.status !== "awaiting_input") {
    throw new GraphQLError("This choice is not waiting for an answer", {
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
        inArray(queuedTasks.status, ["queued", "running", "awaiting_input"]),
      ),
    );

  const dismissedAt = new Date().toISOString();
  const updatedSteps = [];

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
      summary: "Run dismissed by user",
      ...(step.id === queuedTask.id
        ? {}
        : { note: "cancelled because the run was dismissed" }),
    };

    const [updated] = await db
      .update(queuedTasks)
      .set({ status: "completed", pendingChoice: null, result })
      .where(eq(queuedTasks.id, step.id))
      .returning();

    if (updated) {
      updatedSteps.push(updated);
      publish(updated, "run dismissed by user");
    }
  }

  const current = updatedSteps.find((step) => step.id === queuedTask.id);
  if (!current) {
    throw new GraphQLError("This choice has already been answered", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return updatedSteps;
}

export async function deleteQueuedTask(id: number): Promise<string> {
  const queuedTask = await db.query.queuedTasks.findFirst({ where: { id } });

  if (!queuedTask) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await db.delete(queuedTasks).where(eq(queuedTasks.id, id));

  return "successfully deleted queuedTask";
}

export async function deleteCompletedQueuedTasksBefore(
  date: Date,
): Promise<string> {
  await db
    .delete(queuedTasks)
    .where(
      and(eq(queuedTasks.status, "completed"), lt(queuedTasks.queued_at, date)),
    );

  return "successfully deleted queuedTasks";
}
