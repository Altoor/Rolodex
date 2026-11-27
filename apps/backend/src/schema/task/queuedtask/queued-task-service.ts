import { GraphQLError } from "graphql";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db, fileEntries, queuedTasks } from "@repo/db";
import { accessibleFileEntryCondition } from "@repo/tools/tools/file/services/access";
import { toFileEntryRef } from "@repo/tools/tools/file/services/dto";
import { getUserSettings } from "../../user/user-settings-service";
import { assertTaskVisible } from "../task/task-visibility";
import { triggerQueue } from "../../../queue";
import { warmQueuedRows } from "../../../queue/model-warmup";
import { createRun, settleStandardRunIfIdle } from "../../../queue/run-store";

export { dismissQueuedTask, retryQueuedTask } from "./queued-task-actions";

export interface CreateQueuedTaskInput {
  taskId?: number | null;
  state: string;
  fileIds?: number[] | null;
  folderIds?: number[] | null;
  /**
   * Pre-built initial tool state. Used when a revised assisted run reuses the
   * original run's attachments instead of uploading new files.
   */
  toolState?: Record<string, unknown>[] | null;
}

async function loadContextEntries(
  userId: number,
  ids: number[] | null | undefined,
  kind: "file" | "folder",
) {
  const unique = [
    ...new Set((ids ?? []).filter((id) => Number.isInteger(id) && id > 0)),
  ];

  if (unique.length === 0) return [];

  // The caller may only attach entries they can see. A private folder or file
  // owned by someone else must look missing, so the ids never enter toolState.
  const rows = await db
    .select()
    .from(fileEntries)
    .where(
      and(
        inArray(fileEntries.id, unique),
        isNull(fileEntries.deletedAt),
        accessibleFileEntryCondition(userId),
      ),
    );

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

  // Drafts are private to their owner; never execute another user's draft.
  await assertTaskVisible(userId, resolvedTaskId);

  let files: Awaited<ReturnType<typeof loadContextEntries>> = [];
  let folders: Awaited<ReturnType<typeof loadContextEntries>> = [];
  if (!input.toolState) {
    [files, folders] = await Promise.all([
      loadContextEntries(userId, input.fileIds, "file"),
      loadContextEntries(userId, input.folderIds, "folder"),
    ]);
  }

  const toolState: Record<string, unknown>[] = input.toolState
    ? [...input.toolState]
    : [];
  if (!input.toolState && (files.length > 0 || folders.length > 0)) {
    toolState.push({
      // Marks the run's initial attachments so tools such as scan_files can
      // distinguish them from files produced by earlier steps.
      uploaded: true,
      ...(files.length > 0 ? { files } : {}),
      ...(folders.length > 0 ? { folders } : {}),
    });
  }

  const run = await createRun({
    userId,
    mode: "standard",
    state: input.state,
    startTaskId: resolvedTaskId,
  });

  const queuedTask = {
    taskId: resolvedTaskId,
    state: input.state,
    toolState,
    depth: 0,
    // A new user submission starts a new chain run.
    runId: run.id,
    queued_by: userId,
  };

  const [created] = await db.insert(queuedTasks).values(queuedTask).returning();

  // Warm the model while the queue starts up. Errors are logged inside.
  if (created) void warmQueuedRows([created]);

  // Start the queue if it is idle (the loop is a no-op otherwise).
  triggerQueue();

  return created;
}

export async function completeQueuedTask(userId: number, id: number) {
  const queuedTask = await db.query.queuedTasks.findFirst({ where: { id } });

  if (!queuedTask || queuedTask.queued_by !== userId) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const [updated] = await db
    .update(queuedTasks)
    .set({ status: "completed" })
    .where(eq(queuedTasks.id, id))
    .returning();

  await settleStandardRunIfIdle(queuedTask.runId).catch(() => undefined);
  return updated;
}

export async function deleteQueuedTask(
  userId: number,
  id: number,
): Promise<string> {
  const queuedTask = await db.query.queuedTasks.findFirst({ where: { id } });

  if (!queuedTask || queuedTask.queued_by !== userId) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await db.delete(queuedTasks).where(eq(queuedTasks.id, id));

  return "successfully deleted queuedTask";
}

export async function deleteCompletedQueuedTasksBefore(
  userId: number,
  date: Date,
): Promise<string> {
  await db
    .delete(queuedTasks)
    .where(
      and(
        eq(queuedTasks.queued_by, userId),
        eq(queuedTasks.status, "completed"),
        lt(queuedTasks.queued_at, date),
      ),
    );

  return "successfully deleted queuedTasks";
}
