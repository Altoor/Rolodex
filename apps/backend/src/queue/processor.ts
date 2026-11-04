import { asc, eq } from "drizzle-orm";
import type {
  SystemOneAnswer,
  SystemOneChoiceAnswer,
  SystemOneNoulAnswer,
  SystemOneResponse,
  SystemOneScoreAnswer,
} from "ollama";
import { db } from "../schema/builder";
import { queuedTasks, taskResults } from "../db";
import { ollama } from "../ai/Ollama";
import { setupQuestions } from "../schema/ai/ai-service";
import { publishQueuedTaskEvent } from "./pubsub";

const MODEL = "tev1:4b";
const MAX_STEPS_PER_RUN = 15;

type QueuedRow = typeof queuedTasks.$inferSelect;
type TaskResultRow = typeof taskResults.$inferSelect;

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
  const stale = await db
    .update(queuedTasks)
    .set({ status: "queued" })
    .where(eq(queuedTasks.status, "running"))
    .returning();

  if (stale.length > 0) {
    console.info(
      `Queue: reset ${stale.length} stuck running task(s) to queued`,
    );
    triggerQueue();
  }
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  // Steps executed so far per chain run (loop guard).
  const stepsByRun = new Map<string, number>();

  try {
    for (;;) {
      // Plain select on purpose: in drizzle-orm 1.0.0-rc, relational
      // queries with a filter on a pgEnum column crash with
      // "Unknown relational filter field: decoder".
      const [row] = await db
        .select()
        .from(queuedTasks)
        .where(eq(queuedTasks.status, "queued"))
        .orderBy(asc(queuedTasks.queued_at), asc(queuedTasks.id))
        .limit(1);
      if (!row) break;
      await processStep(row, stepsByRun);
    }
  } finally {
    processing = false;
  }
}

async function processStep(
  row: QueuedRow,
  stepsByRun: Map<string, number>,
): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: { id: row.taskId },
  });
  if (!task) {
    await finishStep(row.id, "failed", { note: "task no longer exists" });
    return;
  }

  const [running] = await db
    .update(queuedTasks)
    .set({ status: "running" })
    .where(eq(queuedTasks.id, row.id))
    .returning();
  if (running) publish(running, `running task "${task.name}"`);

  if (task.type !== "decision" || task.decisionId == null) {
    // Only "decision" tasks can be executed for now.
    await finishStep(row.id, "completed", {
      note: `skipped: task type "${task.type}" is not runnable yet`,
    });
    return; // chain stops here; the queue keeps moving
  }

  const decision = await db.query.decisions.findFirst({
    where: { id: task.decisionId },
  });
  if (!decision) {
    await finishStep(
      row.id,
      "failed",
      { note: `decision ${task.decisionId} not found` },
    );
    return;
  }

  let response: SystemOneResponse;
  try {
    const questions = setupQuestions([
      {
        type: decision.type,
        instruction: decision.instruction,
        decisionPremise: decision.decisionPremise,
        options: decision.options ?? undefined,
        optionDescriptions: decision.optionDescriptions ?? undefined,
      },
    ]);
    response = await ollama.systemone({
      model: MODEL,
      state: row.state,
      questions,
    });
  } catch (err) {
    await finishStep(row.id, "failed", {
      note: `systemone error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return;
  }

  const answer = response.answers[decision.decisionPremise];
  if (!answer) {
    await finishStep(row.id, "failed", {
      note: `no answer returned for premise "${decision.decisionPremise}"`,
    });
    return;
  }

  const results = (
    await db.query.taskResults.findMany({ where: { taskId: task.id } })
  ).sort((a, b) => a.id - b.id);

  // First taskResult whose type matches and whose thresholds all pass wins.
  // Results without a wired-up resultTaskId cannot continue the chain.
  const match = results.find(
    (r) =>
      r.type === answer.type && r.resultTaskId != null && resultMatches(r, answer),
  );

  const summary = summarizeAnswer(task.name, answer);

  let nextTaskId: number | null = null;
  let appendState = false;
  let branch: "result" | "fallback" | "none" = "none";
  let note: string | undefined;

  if (match) {
    nextTaskId = match.resultTaskId;
    appendState = match.appendState;
    branch = "result";
  } else if (task.fallbackTaskId != null) {
    nextTaskId = task.fallbackTaskId;
    branch = "fallback";
  } else {
    note = "no matching result and no fallback — run finished";
  }

  const steps = (stepsByRun.get(row.runId) ?? 0) + 1;
  stepsByRun.set(row.runId, steps);

  let enqueueNext = nextTaskId != null;
  if (enqueueNext && steps >= MAX_STEPS_PER_RUN) {
    enqueueNext = false;
    const maxNote = `max chain depth (${MAX_STEPS_PER_RUN}) reached — run stopped`;
    note = note ? `${note}; ${maxNote}` : maxNote;
  }

  const result = {
    answer,
    usage: response.usage,
    branch,
    nextTaskId,
    summary,
    ...(note ? { note } : {}),
  };
  await finishStep(row.id, "completed", result, summary ?? note);

  if (enqueueNext && nextTaskId != null) {
    const nextState = appendState ? `${row.state}\n\n${summary}` : row.state;
    await db.insert(queuedTasks).values({
      taskId: nextTaskId,
      state: nextState,
      runId: row.runId,
      queued_by: row.queued_by,
    });
  }
}

/**
 * Checks one taskResult's thresholds against a SystemOne answer.
 * Every threshold that is set must pass.
 */
function resultMatches(
  r: TaskResultRow,
  answer: SystemOneAnswer,
): boolean {
  switch (answer.type) {
    case "choice": {
      const a = answer as SystemOneChoiceAnswer;
      if (r.option != null && r.option !== a.choice) return false;
      if (r.probabilityThreshold != null) {
        const p = a.probabilities[a.choice] ?? 0;
        if (p < r.probabilityThreshold) return false;
      }
      if (r.confidenceThreshold != null && a.confidence < r.confidenceThreshold)
        return false;
      return true;
    }
    case "score": {
      const a = answer as SystemOneScoreAnswer;
      if (r.scoreThreshold != null && a.score < r.scoreThreshold) return false;
      if (r.confidenceThreshold != null && a.confidence < r.confidenceThreshold)
        return false;
      return true;
    }
    case "noul": {
      const a = answer as SystemOneNoulAnswer;
      // A noul answer only carries the noul probability, and noul results
      // expose a single threshold knob, so whichever threshold column is
      // set applies to the noul probability.
      const threshold = r.probabilityThreshold ?? r.confidenceThreshold;
      if (threshold != null && a.noul < threshold) return false;
      return true;
    }
    default:
      return false;
  }
}

function summarizeAnswer(taskName: string, answer: SystemOneAnswer): string {
  switch (answer.type) {
    case "choice":
      return `Decision "${taskName}": chose "${answer.choice}" (confidence ${answer.confidence})`;
    case "score":
      return `Decision "${taskName}": scored ${answer.score} (confidence ${answer.confidence})`;
    case "noul":
      return `Decision "${taskName}": noul probability ${answer.noul}`;
  }
}

async function finishStep(
  id: number,
  status: "completed" | "failed",
  result: unknown,
  message?: string,
): Promise<void> {
  const [updated] = await db
    .update(queuedTasks)
    .set({ status, result })
    .where(eq(queuedTasks.id, id))
    .returning();
  if (updated) publish(updated, message ?? (result as { note?: string })?.note ?? status);
}

function publish(row: QueuedRow, message: string): void {
  publishQueuedTaskEvent({ queuedTask: row, message });
}
