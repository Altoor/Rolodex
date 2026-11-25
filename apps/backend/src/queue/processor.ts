import { db, getAppSettings } from "@repo/db";
import { processAssistedStep } from "./assisted-step";
import { warmQueuedRows } from "./model-warmup";
import { getRun, setRunStatus, settleStandardRunIfIdle } from "./run-store";
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

// A single in-process guard: only one queue loop runs at a time. A wake-up
// arriving while the loop runs is remembered so the loop re-checks the queue
// after it drains, instead of exiting just before work becomes runnable.
let processing = false;
let rerunRequested = false;

/**
 * Kicks off the queue loop. If a loop is already running, it is asked to run
 * once more after it drains. Fire-and-forget; called by the createQueuedTask
 * mutation, run settlement and the join release sweep.
 */
export function triggerQueue(): void {
  if (processing) {
    rerunRequested = true;
    return;
  }
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
  if (processing) {
    rerunRequested = true;
    return;
  }

  processing = true;
  try {
    do {
      rerunRequested = false;
      await runQueueLoop();
    } while (rerunRequested);
  } finally {
    processing = false;
  }
}

async function runQueueLoop(): Promise<void> {
  const running = new Map<number, Promise<void>>();
  let exclusiveRunning = false;

  /**
   * Assisted runs are sequential, so a step that cannot run means the run is
   * over. Standard runs may fan out, so leave their history alone here.
   */
  const failAssistedRun = async (
    row: QueuedRow,
    note: string,
  ): Promise<void> => {
    const run = await getRun(row.runId).catch(() => undefined);
    if (run?.mode === "assisted") {
      await setRunStatus(run.id, "failed").catch(() => undefined);
      console.error(`Queue: assisted run ${run.id} failed: ${note}`);
    }
  };

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
        await failAssistedRun(row, `queue error: ${message}`);
      } finally {
        running.delete(row.id);
        if (!task.canRunInParallel) exclusiveRunning = false;
        // Standard chains can fan out; this only ends the run once every
        // branch has settled. Assisted runs keep their review statuses.
        await settleStandardRunIfIdle(row.runId).catch(() => undefined);
      }
    })();

    running.set(row.id, promise);
    if (!task.canRunInParallel) exclusiveRunning = true;
  };

  /**
   * Loads the task for a step and forces assisted-run steps to run alone, even
   * when their task definition allows parallel execution.
   */
  const loadRunnableTask = async (
    row: QueuedRow,
  ): Promise<TaskRow | undefined> => {
    const task = await db.query.tasks.findFirst({
      where: { id: row.taskId },
    });
    if (!task) return undefined;
    const run = await getRun(row.runId);
    return run?.mode === "assisted"
      ? { ...task, canRunInParallel: false }
      : task;
  };

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

      const task = await loadRunnableTask(row);
      if (!task) {
        await finishStep(row.id, "failed", {
          note: "task no longer exists",
        });
        await failAssistedRun(row, "task no longer exists");
        await settleStandardRunIfIdle(row.runId).catch(() => undefined);
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
        const task = await loadRunnableTask(row);
        if (!task) {
          await finishStep(row.id, "failed", {
            note: "task no longer exists",
          });
          await failAssistedRun(row, "task no longer exists");
          await settleStandardRunIfIdle(row.runId).catch(() => undefined);
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
}

async function processStep(row: QueuedRow, task: TaskRow): Promise<void> {
  const claimed = await claimStep(row, task.name);
  if (!claimed) return;

  // Assisted runs execute one step at a time and stop for review instead of
  // enqueueing their successor immediately.
  const run = await getRun(row.runId);
  if (run?.mode === "assisted") {
    await processAssistedStep(row, task);
    return;
  }

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
