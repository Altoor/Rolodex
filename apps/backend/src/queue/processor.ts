import { db } from "@repo/db";
import { processDecisionStep } from "./processors/decision-step";
import { processToolStep } from "./processors/tool-step";
import {
  claimStep,
  findNextQueuedStep,
  finishStep,
  resetRunningSteps,
} from "./step-store";
import type { QueuedRow } from "./types";

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

  try {
    for (;;) {
      const row = await findNextQueuedStep();
      if (!row) break;
      await processStep(row);
    }
  } finally {
    processing = false;
  }
}

async function processStep(row: QueuedRow): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: { id: row.taskId },
  });
  if (!task) {
    await finishStep(row.id, "failed", { note: "task no longer exists" });
    return;
  }

  await claimStep(row.id, task.name);

  if (task.type === "tool") {
    await processToolStep(row, task);
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
