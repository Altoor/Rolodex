import type { SystemOneAnswer, SystemOneResponse } from "ollama";
import { db, taskResults } from "@repo/db";
import { DEFAULT_MODEL, getDecisionModelForUser, ollama } from "@repo/ai";
import { setupQuestions } from "../../schema/ai/ai-service";
import { MAX_CHAIN_DEPTH } from "../constants";
import { resultMatches, summarizeAnswer } from "../result-matcher";
import { awaitStep, enqueueStep, finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";
import {
  decisionResultLabel,
  decisionResultValue,
  type PendingChoice,
  type PendingChoiceOption,
} from "../user-choice";

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

  let response: SystemOneResponse | null = null;
  let answer: SystemOneAnswer | undefined;
  let model = DEFAULT_MODEL;
  let modelError: string | undefined;

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
    answer = response.answers[decision.decisionPremise];

    if (!answer) {
      modelError = `no answer returned for premise "${decision.decisionPremise}"`;
    }
  } catch (err) {
    modelError = `systemone error: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  const results = (
    await db.query.taskResults.findMany({ where: { taskId: task.id } })
  ).sort((a, b) => a.id - b.id);

  const candidates = results.filter((result) => result.resultTaskId != null);

  // First taskResult whose type matches and whose thresholds all pass wins.
  // Results without a wired-up resultTaskId cannot continue the chain.
  const match = answer
    ? results.find(
        (result) =>
          result.type === answer.type &&
          result.resultTaskId != null &&
          resultMatches(result, answer),
      )
    : undefined;

  // A model decision with a matching result always continues automatically.
  if (match && answer) {
    const summary = summarizeAnswer(task.name, answer);
    const nextTaskId = match.resultTaskId!;
    let note: string | undefined;

    let enqueueNext = true;
    if (row.depth >= MAX_CHAIN_DEPTH) {
      enqueueNext = false;
      note = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
    }

    const nextToolState = match.appendState
      ? [...row.toolState, { decision: answer }]
      : row.toolState;

    const result = {
      answer,
      usage: response?.usage ?? null,
      model,
      branch: "result",
      nextTaskId,
      summary,
      ...(note ? { note } : {}),
    };
    await finishStep(row.id, "completed", result, summary);

    if (enqueueNext) {
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
    return;
  }

  // With no match, optionally let the user choose among the result outputs.
  if (task.forceUserDecideIfNoMatch) {
    if (candidates.length === 0) {
      await finishStep(row.id, "failed", {
        note:
          modelError ??
          "no matching result and no result output has a target task",
      });
      return;
    }

    if (!answer && !modelError) {
      modelError = `no answer returned for premise "${decision.decisionPremise}"`;
    }

    const options: PendingChoiceOption[] = candidates.map((result, index) => ({
      id: `decision:${result.id}`,
      label: decisionResultLabel(result, index, decision.type),
      value: decisionResultValue(result, answer ?? null),
      resultTaskId: result.resultTaskId,
      appendState: result.appendState,
      source: "decisionResult",
    }));

    const pendingChoice: PendingChoice = {
      kind: "decisionOutput",
      taskId: task.id,
      prompt:
        decision.instruction ||
        decision.decisionPremise ||
        `Choose an output for ${task.name}`,
      choiceType: "list",
      acceptLabel: "Choose",
      recommendedOptionId: null,
      options,
      createdAt: new Date().toISOString(),
    };

    const summary = `Decision "${task.name}": no match — waiting for user choice`;

    const result = {
      answer: answer ?? null,
      usage: response?.usage ?? null,
      model,
      branch: "awaiting_user",
      recommendedOptionId: null,
      summary,
      ...(modelError ? { note: modelError } : {}),
    };

    await awaitStep(row.id, pendingChoice, result, summary);
    return;
  }

  if (!answer) {
    await finishStep(row.id, "failed", {
      note:
        modelError ??
        `no answer returned for premise "${decision.decisionPremise}"`,
    });
    return;
  }

  const summary = summarizeAnswer(task.name, answer);

  const nextTaskId = task.fallbackTaskId ?? null;
  const branch: "fallback" | "none" = nextTaskId != null ? "fallback" : "none";
  let note =
    nextTaskId == null
      ? "no matching result and no fallback — run finished"
      : undefined;

  let enqueueNext = nextTaskId != null;
  if (enqueueNext && row.depth >= MAX_CHAIN_DEPTH) {
    enqueueNext = false;
    const maxNote = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
    note = note ? `${note}; ${maxNote}` : maxNote;
  }

  const result = {
    answer,
    usage: response?.usage ?? null,
    model,
    branch,
    nextTaskId,
    summary,
    ...(note ? { note } : {}),
  };
  await finishStep(row.id, "completed", result, summary);

  if (enqueueNext && nextTaskId != null) {
    await enqueueStep({
      taskId: nextTaskId,
      // State is immutable for the whole run; decisions add to toolState.
      state: row.state,
      toolState: row.toolState,
      depth: row.depth + 1,
      runId: row.runId,
      queued_by: row.queued_by,
    });
  }
}
