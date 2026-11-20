import { db, getAppSettings } from "@repo/db";
import { gateNextStep } from "./gate-next-step";
import { warmQueuedRows } from "./model-warmup";
import { processDecisionStep } from "./processors/decision-step";
import { processToolStep } from "./processors/tool-step";
import { processUserDecisionStep } from "./processors/user-decision-step";
import {
  claimStep,
  findNextQueuedStep,
  finishStep,
  hasPrioritizedExclusiveStep,
  resetRunningSteps,
} from "./step-store";
import type { QueuedRow, TaskRow } from "./types";

// A single in-process guard: only one queue loop runs at a time.
let processing = false;

/**
 * Kicks off the queue loop (no-op if one is already running).
 * Fire-and-forget; called by the createQueuedTask mutation and on startup.
 */
export function triggerQueue(): void {
  void processQueue();
}

/**
 * Rows still marked "running" after a restart are re-queued, so a chain
 * picks up where the process died.
 */
export async function resetStaleRunningTasks(): Promise<void> {
  const resetCount = await resetRunningSteps();

  if (resetCount > 0) {
    console.info(`Queue: reset ${resetCount} stuck running task(s) to queued`);
    triggerQueue();
  }
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  const running = new Map<number, Promise<void>>();
  let exclusiveRunning = false;

  /** Starts one step and keeps it in the in-flight map until it settles. */
  const launch = (row: QueuedRow, task: TaskRow): void => {
    const promise = (async () => {
      try {
        await processStep(row, task);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await finishStep(row.id, "failed", {
          note: `queue error: ${message}`,
        }).catch(() => undefined);
      } finally {
        running.delete(row.id);
        if (!task.canRunInParallel) exclusiveRunning = false;
      }
    })();

    running.set(row.id, promise);
    if (!task.canRunInParallel) exclusiveRunning = true;
  };

  try {
    for (;;) {
      // While steps are running, warm the model for whatever is next so the
      // load overlaps the current work instead of delaying the next step.
      if (running.size > 0) {
        const upcoming = await findNextQueuedStep();
        if (upcoming) void warmQueuedRows([upcoming]);
      }

      // Nothing is running: prioritized work goes first, then parallel-capable,
      // then exclusive.
      if (running.size === 0) {
        const row = await findNextQueuedStep();
        if (!row) break;

        const task = await db.query.tasks.findFirst({
          where: { id: row.taskId },
        });
        if (!task) {
          await finishStep(row.id, "failed", {
            note: "task no longer exists",
          });
          continue;
        }

        launch(row, task);
        continue;
      }

      // An exclusive step owns the queue until it finishes.
      if (exclusiveRunning) {
        if (running.size > 0) await Promise.race(running.values());
        continue;
      }

      // A prioritized exclusive step must be next. Do not start more parallel
      // work; let the in-flight steps drain so it can run alone.
      if (await hasPrioritizedExclusiveStep()) {
        if (running.size > 0) await Promise.race(running.values());
        continue;
      }

      const settings = await getAppSettings();
      const maxParallel = Math.max(1, settings.maxParallelTasks);

      if (running.size < maxParallel) {
        const row = await findNextQueuedStep({ onlyParallel: true });
        if (row) {
          const task = await db.query.tasks.findFirst({
            where: { id: row.taskId },
          });
          if (!task) {
            await finishStep(row.id, "failed", {
              note: "task no longer exists",
            });
            continue;
          }

          launch(row, task);
          continue;
        }
      }

      // No parallel work can start; wait for capacity or for all of it to
      // drain so an exclusive step can finally run. The map can drain while
      // `getAppSettings`/`findNextQueuedStep` above were in flight, and racing
      // an empty iterator would wait forever.
      if (running.size > 0) {
        await Promise.race(running.values());
      }
    }

    await Promise.allSettled(running.values());
  } finally {
    processing = false;
  }
}

async function processStep(row: QueuedRow, task: TaskRow): Promise<void> {
  const claimed = await claimStep(row, task.name);
  if (!claimed) return;

  // With auto improvement on, every step after the first waits for the user to
  // confirm it (or replace it) before it runs.
  if (await gateNextStep(row, task)) return;

  if (task.type === "tool") {
    await processToolStep(row, task);
    return;
  }

  if (task.type === "userDecision") {
    try {
      await processUserDecisionStep(row, task);
    } catch (err) {
      await finishStep(row.id, "failed", {
        note: `user decision error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
    return;
  }

  if (task.type !== "decision" || task.decisionId == null) {
    await finishStep(row.id, "completed", {
      note: `skipped: task type "${task.type}" is not runnable yet`,
    });
    return; // chain stops here; the queue keeps moving
  }

  await processDecisionStep(row, task);
}
