import type { SystemOneAnswer, SystemOneResponse } from "ollama";
import { db, taskResults } from "@repo/db";
import {
  DEFAULT_MODEL,
  getDecisionModelForUser,
  getOllamaClient,
  getOllamaKeepAlive,
} from "@repo/ai";
import { setupQuestions } from "../../schema/ai/ai-service";
import { getUserSettings } from "../../schema/user/user-settings-service";
import { MAX_CHAIN_DEPTH } from "../constants";
import { applyDecisionBiases, loadDecisionBiases } from "../decision-bias";
import { resultMatches, summarizeAnswer } from "../result-matcher";
import { awaitStep, enqueueStep, finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";
import {
  decisionResultLabel,
  decisionResultValue,
  type PendingChoice,
  type PendingChoiceOption,
} from "../user-choice";
import { buildDecisionModelState } from "./decision-state";

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

  const biases = await loadDecisionBiases(decisionId);
  const modelState = buildDecisionModelState(
    row.state,
    row.toolState,
    task.decisionStateConfig,
  );

  let response: SystemOneResponse | null = null;
  let answer: SystemOneAnswer | undefined;
  let model = DEFAULT_MODEL;
  let modelError: string | undefined;

  let questions: ReturnType<typeof setupQuestions>;
  try {
    questions = setupQuestions([
      {
        type: decision.type,
        instruction: decision.instruction,
        decisionPremise: decision.decisionPremise,
        options: decision.options ?? undefined,
        optionDescriptions: decision.optionDescriptions ?? undefined,
      },
    ]);
  } catch (err) {
    await finishStep(row.id, "failed", {
      note: `decision setup error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return;
  }

  try {
    model =
      row.decisionModel ??
      task.decisionModel ??
      (await getDecisionModelForUser(row.queued_by));
    const ollama = await getOllamaClient();
    const keepAlive = await getOllamaKeepAlive();
    response = await ollama.systemone({
      model,
      state: modelState,
      questions,
      ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
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

  const biased = answer
    ? applyDecisionBiases(answer, biases, decision.options ?? undefined)
    : null;
  const effectiveAnswer = biased?.answer ?? answer;
  const appliedBiases = biased?.applied ?? [];

  const results = (
    await db.query.taskResults.findMany({ where: { taskId: task.id } })
  ).sort((a, b) => a.id - b.id);

  const candidates = results.filter((result) => result.resultTaskId != null);

  // First taskResult whose type matches and whose thresholds all pass wins.
  // Results without a wired-up resultTaskId cannot continue the chain.
  const match = effectiveAnswer
    ? results.find(
        (result) =>
          result.type === effectiveAnswer.type &&
          result.resultTaskId != null &&
          resultMatches(result, effectiveAnswer),
      )
    : undefined;

  // A model decision with a matching result always continues automatically.
  if (match && effectiveAnswer) {
    const summary = summarizeAnswer(task.name, effectiveAnswer);
    const nextTaskId = match.resultTaskId!;
    let note: string | undefined;

    let enqueueNext = true;
    if (row.depth >= MAX_CHAIN_DEPTH) {
      enqueueNext = false;
      note = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
    }

    const nextToolState = match.appendState
      ? [...row.toolState, { decision: effectiveAnswer }]
      : row.toolState;

    const result = {
      answer,
      effectiveAnswer,
      appliedBiases,
      matchedResultId: match.id,
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

  // With auto improvement on, a chosen option whose result has no target task
  // pauses so the user can wire the next task instead of silently dropping the
  // branch. The UI asks whether to use an existing task or define a new one.
  let unwiredMatch: (typeof results)[number] | undefined;
  if (!match && effectiveAnswer) {
    const settings = await getUserSettings(row.queued_by);
    if (settings.flowAutoImprovement) {
      unwiredMatch = results.find(
        (result) =>
          result.resultTaskId == null &&
          result.type === effectiveAnswer.type &&
          resultMatches(result, effectiveAnswer),
      );
    }
  }

  if (unwiredMatch && effectiveAnswer) {
    const optionIndex =
      unwiredMatch.option != null && decision.options
        ? decision.options.indexOf(unwiredMatch.option)
        : -1;
    const optionDescription =
      optionIndex >= 0
        ? (decision.optionDescriptions?.[optionIndex] ?? null)
        : null;
    const label = decisionResultLabel(
      unwiredMatch,
      results.indexOf(unwiredMatch),
      decision.type,
    );
    const summary = `Decision "${task.name}": "${label}" needs a next task`;

    await awaitStep(
      row.id,
      {
        kind: "decisionTarget",
        taskId: task.id,
        prompt: `Where should "${label}" go?`,
        choiceType: "list",
        acceptLabel: "Continue",
        recommendedOptionId: null,
        options: [],
        createdAt: new Date().toISOString(),
      } satisfies PendingChoice,
      {
        answer,
        effectiveAnswer,
        appliedBiases,
        matchedResultId: null,
        usage: response?.usage ?? null,
        model,
        branch: "unwired",
        nextTaskId: null,
        unwiredResultId: unwiredMatch.id,
        unwiredOption: label,
        unwiredOptionDescription: optionDescription,
        summary,
        note: "This option has no next task yet. Choose an existing task or define a new one.",
      },
      summary,
    );
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
      value: decisionResultValue(result, effectiveAnswer ?? null),
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
      effectiveAnswer: effectiveAnswer ?? null,
      appliedBiases,
      matchedResultId: null,
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

  if (!answer || !effectiveAnswer) {
    await finishStep(row.id, "failed", {
      note:
        modelError ??
        `no answer returned for premise "${decision.decisionPremise}"`,
    });
    return;
  }

  const summary = summarizeAnswer(task.name, effectiveAnswer);

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
    effectiveAnswer,
    appliedBiases,
    matchedResultId: null,
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
