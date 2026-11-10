import { asc, eq } from "drizzle-orm";
import type {
  SystemOneAnswer,
  SystemOneChoiceAnswer,
  SystemOneNoulAnswer,
  SystemOneResponse,
  SystemOneScoreAnswer,
} from "ollama";
import { db } from "../schema/builder";
import { queuedTasks, taskResults, tasks } from "../db";
import { ollama } from "../ai/Ollama";
import {
  DEFAULT_MODEL,
  getDecisionModelForUser,
  getModelForUser,
} from "../ai/model";
import { setupQuestions } from "../schema/ai/ai-service";
import { publishQueuedTaskEvent } from "./pubsub";
import {
  getTool,
  type ToolConfig,
  type ToolStateEntry,
  type ToolStateEntryInput,
} from "../tools";

const MAX_CHAIN_DEPTH = 20;
const MAX_FOREACH_ITEMS = 50;

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

  const [running] = await db
    .update(queuedTasks)
    .set({ status: "running" })
    .where(eq(queuedTasks.id, row.id))
    .returning();
  if (running) publish(running, `running task "${task.name}"`);

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

  const decision = await db.query.decisions.findFirst({
    where: { id: task.decisionId },
  });
  if (!decision) {
    await finishStep(row.id, "failed", {
      note: `decision ${task.decisionId} not found`,
    });
    return;
  }

  let response: SystemOneResponse;
  let model = DEFAULT_MODEL;
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
    model =
      row.decisionModel ??
      task.decisionModel ??
      (await getDecisionModelForUser(row.queued_by));
    response = await ollama.systemone({
      model,
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
      r.type === answer.type &&
      r.resultTaskId != null &&
      resultMatches(r, answer),
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

  let enqueueNext = nextTaskId != null;
  if (enqueueNext && row.depth >= MAX_CHAIN_DEPTH) {
    enqueueNext = false;
    const maxNote = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
    note = note ? `${note}; ${maxNote}` : maxNote;
  }

  const nextToolState = appendState
    ? [...row.toolState, { decision: answer }]
    : row.toolState;

  const result = {
    answer,
    usage: response.usage,
    model,
    branch,
    nextTaskId,
    summary,
    ...(note ? { note } : {}),
  };
  await finishStep(row.id, "completed", result, summary ?? note);

  if (enqueueNext && nextTaskId != null) {
    await db.insert(queuedTasks).values({
      taskId: nextTaskId,
      // State is immutable for the whole run; decisions add to toolState.
      state: row.state,
      toolState: nextToolState,
      depth: row.depth + 1,
      runId: row.runId,
      queued_by: row.queued_by,
    });
  }
}

async function processToolStep(
  row: QueuedRow,
  task: typeof tasks.$inferSelect,
): Promise<void> {
  if (!task.toolKey) {
    await finishStep(row.id, "failed", {
      toolKey: null,
      note: "tool task has no toolKey",
    });
    return;
  }

  const tool = getTool(task.toolKey);
  if (!tool) {
    await finishStep(row.id, "failed", {
      toolKey: task.toolKey,
      note: `unknown tool "${task.toolKey}"`,
    });
    return;
  }

  const outputType = task.toolOutputType ?? "normal";
  const supportedOutputTypes = tool.definition.outputTypes ?? ["normal"];

  if (!supportedOutputTypes.includes(outputType)) {
    await finishStep(row.id, "failed", {
      toolKey: task.toolKey,
      note: `tool "${task.toolKey}" does not support output type "${outputType}"`,
    });
    return;
  }

  const toolConfig = (task.toolConfig as ToolConfig | null) ?? null;

  try {
    const model =
      row.model ?? task.model ?? (await getModelForUser(row.queued_by));
    const decisionModel =
      row.decisionModel ??
      task.decisionModel ??
      (await getDecisionModelForUser(row.queued_by));

    const execution = await tool.execute({
      userId: row.queued_by,
      runId: row.runId,
      taskId: task.id,
      queuedTaskId: row.id,
      state: row.state,
      toolState: row.toolState,
      outputType,
      config: toolConfig,
      // Selector override > task model > user default, independently for each
      // model role.
      model,
      decisionModel,
    });

    let nextToolState = execution.toolState ?? row.toolState;

    if (execution.toolStateAppend !== undefined) {
      nextToolState = [
        ...nextToolState,
        ...toToolStateEntries(execution.toolStateAppend),
      ];
    }

    // Legacy stateAppend now becomes a simple text entry instead of mutating
    // the original state.
    if (execution.stateAppend !== undefined) {
      nextToolState = [...nextToolState, { text: execution.stateAppend }];
    }

    if (execution.clearToolState) nextToolState = [];

    const nextState = execution.nextState ?? row.state;

    let nextTaskId: number | null;
    let branch: "true" | "false" | "tool" | "none";

    if (execution.branch === "true") {
      nextTaskId = task.onTrueTaskId;
      branch = "true";
    } else if (execution.branch === "false") {
      nextTaskId = task.onFalseTaskId;
      branch = "false";
    } else {
      nextTaskId = execution.nextTaskId ?? task.fallbackTaskId ?? null;
      branch = nextTaskId != null ? "tool" : "none";
    }

    let note: string | undefined;
    let childQueuedTaskIds: number[] = [];
    let itemCount: number | undefined;

    if (execution.branch && nextTaskId == null) {
      note = `branch "${execution.branch}" has no target task configured — run stopped`;
    }

    if (outputType === "normal") {
      const append =
        execution.appendState ?? Boolean(toolConfig?.appendState);

      if (
        append &&
        execution.toolStateAppend === undefined &&
        execution.stateAppend === undefined
      ) {
        nextToolState = [...nextToolState, execution.output];
      }

      if (nextTaskId != null) {
        if (row.depth >= MAX_CHAIN_DEPTH) {
          nextTaskId = null;
          note = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
        } else {
          await db.insert(queuedTasks).values({
            taskId: nextTaskId,
            state: nextState,
            toolState: nextToolState,
            depth: row.depth + 1,
            parentQueuedTaskId: row.id,
            runId: row.runId,
            queued_by: row.queued_by,
            model: execution.nextModel ?? row.model,
            decisionModel: execution.nextDecisionModel ?? row.decisionModel,
          });
        }
      }
    } else {
      const items = execution.foreach?.items ?? [];
      itemCount = items.length;

      if (items.length > MAX_FOREACH_ITEMS) {
        await finishStep(row.id, "failed", {
          toolKey: task.toolKey,
          note: `foreach returned ${items.length} items; max is ${MAX_FOREACH_ITEMS}`,
        });
        return;
      }

      const forkTaskId = execution.foreach?.nextTaskId ?? nextTaskId;

      if (items.length > 0 && forkTaskId == null) {
        await finishStep(row.id, "failed", {
          toolKey: task.toolKey,
          note: "foreach has no next task configured",
        });
        return;
      }

      if (items.length > 0 && row.depth >= MAX_CHAIN_DEPTH) {
        nextTaskId = null;
        note = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
      } else if (items.length > 0 && forkTaskId != null) {
        const inserted = await db
          .insert(queuedTasks)
          .values(
            items.map((item) => ({
              taskId: forkTaskId,
              state: nextState,
              toolState: [...nextToolState, item],
              depth: row.depth + 1,
              parentQueuedTaskId: row.id,
              runId: row.runId,
              queued_by: row.queued_by,
              model: execution.nextModel ?? row.model,
              decisionModel:
                execution.nextDecisionModel ?? row.decisionModel,
            })),
          )
          .returning({ id: queuedTasks.id });

        childQueuedTaskIds = inserted.map((child) => child.id);
        nextTaskId = forkTaskId;
      } else {
        nextTaskId = null;
        note = "foreach returned no items — no next tasks enqueued";
      }
    }

    const result = {
      toolKey: task.toolKey,
      output: execution.output,
      summary: execution.summary,
      outputType,
      branch,
      nextTaskId,
      ...(itemCount !== undefined ? { itemCount } : {}),
      ...(childQueuedTaskIds.length > 0 ? { childQueuedTaskIds } : {}),
      ...(note ? { note } : {}),
    };

    await finishStep(row.id, "completed", result, execution.summary ?? note);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishStep(row.id, "failed", {
      toolKey: task.toolKey,
      note: `tool error: ${message}`,
    });
  }
}

function toToolStateEntries(
  input: ToolStateEntryInput | ToolStateEntryInput[],
): ToolStateEntry[] {
  return Array.isArray(input) ? input : [input];
}

/**
 * Checks one taskResult's thresholds against a SystemOne answer.
 * Every threshold that is set must pass.
 */
function resultMatches(r: TaskResultRow, answer: SystemOneAnswer): boolean {
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
  if (updated)
    publish(updated, message ?? (result as { note?: string })?.note ?? status);
}

function publish(row: QueuedRow, message: string): void {
  publishQueuedTaskEvent({ queuedTask: row, message });
}
