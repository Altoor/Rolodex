import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db, fileEntries, queuedTasks } from "@repo/db";
import { toFileEntryRef } from "@repo/tools/tools/file/services/dto";
import { getUserSettings } from "../../user/user-settings-service";
import { triggerQueue } from "../../../queue";
import { warmQueuedRows } from "../../../queue/model-warmup";
import { dismissRun, isRunDismissed, publish } from "../../../queue/step-store";

export interface CreateQueuedTaskInput {
  taskId?: number | null;
  state: string;
  fileIds?: number[] | null;
  folderIds?: number[] | null;
}

async function loadContextEntries(
  ids: number[] | null | undefined,
  kind: "file" | "folder",
) {
  const unique = [
    ...new Set((ids ?? []).filter((id) => Number.isInteger(id) && id > 0)),
  ];

  if (unique.length === 0) return [];

  const rows = await db
    .select()
    .from(fileEntries)
    .where(inArray(fileEntries.id, unique));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = unique.filter((id) => !byId.has(id));

  if (missing.length > 0) {
    throw new GraphQLError(`File entries not found: ${missing.join(", ")}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const wrongKind = unique.filter((id) => byId.get(id)?.kind !== kind);

  if (wrongKind.length > 0) {
    throw new GraphQLError(
      `Expected ${kind} entries, got: ${wrongKind.join(", ")}`,
      {
        extensions: { code: "BAD_USER_INPUT" },
      },
    );
  }

  // Preserve the caller's order and flatten the selected entries into the
  // toolState shape the file tools already understand.
  return unique.map((id) => toFileEntryRef(byId.get(id)!));
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

  const [files, folders] = await Promise.all([
    loadContextEntries(input.fileIds, "file"),
    loadContextEntries(input.folderIds, "folder"),
  ]);

  const toolState: Record<string, unknown>[] = [];
  if (files.length > 0 || folders.length > 0) {
    toolState.push({
      // Marks the run's initial attachments so tools such as scan_files can
      // distinguish them from files produced by earlier steps.
      uploaded: true,
      ...(files.length > 0 ? { files } : {}),
      ...(folders.length > 0 ? { folders } : {}),
    });
  }

  const queuedTask = {
    taskId: resolvedTaskId,
    state: input.state,
    toolState,
    depth: 0,
    // A new user submission starts a new chain run.
    runId: randomUUID(),
    queued_by: userId,
  };

  const [created] = await db.insert(queuedTasks).values(queuedTask).returning();

  // Warm the model while the queue starts up. Errors are logged inside.
  if (created) void warmQueuedRows([created]);

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
    queuedTask.status !== "awaiting_input"
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

  const current = updatedSteps.find((step) => step.id === queuedTask.id);
  if (!current) {
    throw new GraphQLError("This run is no longer active", {
      extensions: { code: "BAD_USER_INPUT" },
    });
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

  const [retry] = await db
    .insert(queuedTasks)
    .values({
      taskId: queuedTask.taskId,
      state: queuedTask.state,
      toolState: queuedTask.toolState,
      parentQueuedTaskId: queuedTask.parentQueuedTaskId,
      depth: queuedTask.depth,
      status: "queued",
      runId: isRunDismissed(queuedTask.runId) ? randomUUID() : queuedTask.runId,
      queued_by: queuedTask.queued_by,
      model: queuedTask.model,
      decisionModel: queuedTask.decisionModel,
      nextStepApproved: queuedTask.nextStepApproved,
    })
    .returning();

  if (retry) void warmQueuedRows([retry]);
  triggerQueue();

  return retry;
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
