import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { and, eq, lt } from "drizzle-orm";
import { db, queuedTasks } from "@repo/db";
import { getUserSettings } from "../user/user-settings-service";
import { triggerQueue } from "../../queue";

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
    .where(and(eq(queuedTasks.status, "completed"), lt(queuedTasks.queued_at, date)));

  return "successfully deleted queuedTasks";
}
