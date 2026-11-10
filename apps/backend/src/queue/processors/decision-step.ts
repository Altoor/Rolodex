import type { SystemOneResponse } from "ollama";
import { db, queuedTasks, taskResults } from "@repo/db";
import {
  DEFAULT_MODEL,
  getDecisionModelForUser,
  ollama,
} from "@repo/ai";
import { setupQuestions } from "../../schema/ai/ai-service";
import { MAX_CHAIN_DEPTH } from "../constants";
import { resultMatches, summarizeAnswer } from "../result-matcher";
import { enqueueStep, finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";

/** Executes a decision task and enqueues the matching/fallback next step. */
export async function processDecisionStep(
  row: QueuedRow,
  task: TaskRow,
): Promise<void> {
  const decisionId = task.decisionId!;
  const decision = await db.query.decisions.findFirst({
    where: { id: decisionId },
  });
  if (!decision) {
    await finishStep(row.id, "failed", {
      note: `decision ${decisionId} not found`,
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
    await enqueueStep({
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
