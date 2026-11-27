import { HttpError, type ApiRuntime } from "@repo/api";
import { and, eq, inArray } from "drizzle-orm";
import { db, queuedTasks } from "@repo/db";
import { uploadFilesForApi } from "../schema/file/file-upload-service";
import { createQueuedTask } from "../schema/task/queuedtask/queued-task-service";
import { queueEvents, type QueuedTaskEvent } from "../queue/pubsub";
import { setRunStatus } from "../queue/run-store";

function toHttpError(err: unknown, statusCode: number): HttpError {
  if (err instanceof HttpError) return err;
  return new HttpError(
    err instanceof Error ? err.message : "Request failed",
    statusCode,
  );
}

/** Backend-owned queue/file/event hooks used by the outward API package. */
export const apiRuntime: ApiRuntime = {
  async queueFlow(input) {
    try {
      const queued = await createQueuedTask(input.userId, {
        taskId: input.taskId,
        state: input.state,
        fileIds: input.fileIds,
      });
      if (!queued) throw new Error("failed to queue flow");

      return { runId: queued.runId, stepId: queued.id };
    } catch (err) {
      throw toHttpError(err, 400);
    }
  },

  async uploadFiles(files, userId) {
    try {
      const rows = await uploadFilesForApi(files, null, userId);
      return rows.map((row) => ({ id: row.id }));
    } catch (err) {
      throw toHttpError(err, 400);
    }
  },

  async cancelFlow(runId) {
    await db
      .update(queuedTasks)
      .set({ status: "completed", pendingChoice: null })
      .where(
        and(
          eq(queuedTasks.runId, runId),
          inArray(queuedTasks.status, [
            "queued",
            "running",
            "awaiting_input",
            "waiting",
          ]),
        ),
      )
      .catch(() => undefined);
    await setRunStatus(runId, "cancelled").catch(() => undefined);
  },

  onRunEvent(runId, listener) {
    const handler = (event: QueuedTaskEvent) => {
      if (event.queuedTask.runId === runId) listener();
    };

    queueEvents.on("queuedTask", handler);
    return () => {
      queueEvents.off("queuedTask", handler);
    };
  },
};
