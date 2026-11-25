import type { SystemOneAnswer, SystemOneResponse } from "ollama";
import { db, type queuedTasks } from "@repo/db";
import {
  DEFAULT_MODEL,
  getDecisionModelForUser,
  getOllamaClient,
  getOllamaKeepAlive,
} from "@repo/ai";
import { setupQuestions } from "../../schema/ai/ai-service";
import {
  ASSISTED_CONFIDENCE_FLOOR,
  normalizedConfidence,
} from "../../assisted/domain/decision";
import { MAX_CHAIN_DEPTH } from "../constants";
import { inheritedForkFields } from "../joins";
import { findMatchingResult, summarizeAnswer } from "../result-matcher";
import { awaitStep, enqueueSteps, finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";
import {
  decisionResultLabel,
  decisionResultValue,
  type PendingChoice,
  type PendingChoiceOption,
} from "../user-choice";
import { buildDecisionModelState } from "./decision-state";

export type QueuedStepInsert = typeof queuedTasks.$inferInsert;

export interface DecisionAttemptOutcome {
  status: "completed" | "awaiting_choice" | "awaiting_target";
  result: Record<string, unknown>;
  summary: string;
  nextSteps: QueuedStepInsert[];
  pendingChoice?: PendingChoice;
}

export type DecisionExecution =
  | { ok: true; outcome: DecisionAttemptOutcome }
  | { ok: false; note: string };

export interface DecisionExecutionOptions {
  /**
   * Assisted runs recognize a matching option even when it has no target yet,
   * so the user can wire a next task instead of seeing a false "no match".
   * Standard runs keep the previous fallback behaviour.
   */
  allowUnwiredMatch?: boolean;
}

export interface DecisionSnapshot {
  decision: typeof import("@repo/db").decisions.$inferSelect | null;
  results: (typeof import("@repo/db").taskResults.$inferSelect)[];
}

/** Runs a decision and plans its next step without completing the row. */
export async function executeDecisionAttempt(
  row: QueuedRow,
  task: TaskRow,
  snapshot?: DecisionSnapshot,
  options?: DecisionExecutionOptions,
): Promise<DecisionExecution> {
  const decisionId = task.decisionId;
  if (decisionId == null && !snapshot?.decision) {
    return {
      ok: false,
      note: `Task "${task.name}" is a decision task but has no decision attached. Choose or create a decision in the task builder, then run it again.`,
    };
  }

  const decision = snapshot?.decision
    ? snapshot.decision
    : await db.query.decisions.findFirst({
        where: { id: decisionId! },
      });
  if (!decision) {
    return { ok: false, note: `decision ${decisionId} not found` };
  }

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
    return {
      ok: false,
      note: `decision setup error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
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

  const effectiveAnswer = answer;

  const results = snapshot?.results
    ? [...snapshot.results].sort((a, b) => a.id - b.id)
    : (
        await db.query.taskResults.findMany({ where: { taskId: task.id } })
      ).sort((a, b) => a.id - b.id);

  // The fallback list offers every option that can actually continue. Assisted
  // runs include unwired options so the user can wire one, while standard runs
  // keep the old behaviour of only offering wired results.
  const candidates = options?.allowUnwiredMatch
    ? results
    : results.filter((result) => result.resultTaskId != null);

  const match = effectiveAnswer
    ? findMatchingResult(results, effectiveAnswer, {
        allowUnwired: options?.allowUnwiredMatch,
      })
    : undefined;

  const confidence = effectiveAnswer
    ? normalizedConfidence(effectiveAnswer)
    : null;

  const assisted = options?.allowUnwiredMatch === true;
  const confident =
    confidence == null || confidence >= ASSISTED_CONFIDENCE_FLOOR;

  // Assisted decisions never accept a low-confidence match silently. It is
  // shown to the user as a choice, and accepting requires an explicit override.
  if (match && effectiveAnswer && (!assisted || confident)) {
    if (match.resultTaskId == null) {
      const index = results.indexOf(match);
      const label =
        match.option ?? decisionResultLabel(match, index, decision.type);
      const optionIndex =
        match.option != null && decision.options
          ? decision.options.indexOf(match.option)
          : -1;
      const optionDescription =
        optionIndex >= 0
          ? (decision.optionDescriptions?.[optionIndex] ?? null)
          : null;
      const summary = `Decision "${task.name}": "${label}" needs a next task`;

      return {
        ok: true,
        outcome: {
          status: "awaiting_target",
          pendingChoice: {
            kind: "decisionTarget",
            taskId: task.id,
            prompt: `Where should "${label}" go?`,
            choiceType: "list",
            acceptLabel: "Continue",
            recommendedOptionId: null,
            options: [],
            createdAt: new Date().toISOString(),
          },
          result: {
            answer: answer ?? null,
            effectiveAnswer,
            normalizedConfidence: confidence,
            matchedResultId: match.id,
            usage: response?.usage ?? null,
            model,
            branch: "unwired",
            nextTaskId: null,
            unwiredResultId: match.id,
            unwiredOption: label,
            unwiredOptionDescription: optionDescription,
            summary,
            note: "This option has no next task yet. Choose an existing task or create a new one.",
          },
          summary,
          nextSteps: [],
        },
      };
    }

    const summary = summarizeAnswer(task.name, effectiveAnswer);
    const nextTaskId = match.resultTaskId;
    let note: string | undefined;
    const nextToolState = match.appendState
      ? [...row.toolState, { decision: effectiveAnswer }]
      : row.toolState;

    let nextSteps: QueuedStepInsert[] = [];
    if (row.depth >= MAX_CHAIN_DEPTH) {
      note = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
    } else {
      nextSteps = [
        {
          taskId: nextTaskId,
          // State is immutable for the whole run; decisions add to toolState.
          state: row.state,
          toolState: nextToolState,
          depth: row.depth + 1,
          parentQueuedTaskId: row.id,
          runId: row.runId,
          queued_by: row.queued_by,
          ...inheritedForkFields(row),
        },
      ];
    }

    return {
      ok: true,
      outcome: {
        status: "completed",
        result: {
          answer,
          effectiveAnswer,
          normalizedConfidence: confidence,
          matchedResultId: match.id,
          usage: response?.usage ?? null,
          model,
          branch: "result",
          nextTaskId,
          summary,
          ...(note ? { note } : {}),
        },
        summary,
        nextSteps,
      },
    };
  }

  if (assisted || task.forceUserDecideIfNoMatch) {
    if (candidates.length === 0) {
      return {
        ok: false,
        note:
          modelError ??
          (confidence != null && confidence < ASSISTED_CONFIDENCE_FLOOR
            ? `the model's confidence (${confidence.toFixed(2)}) is below 0.8 and no result output has a target task`
            : "no matching result and no result output has a target task"),
      };
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

    const lowConfidence =
      assisted && confidence != null && confidence < ASSISTED_CONFIDENCE_FLOOR;
    const summary = lowConfidence
      ? `Decision "${task.name}": confidence ${confidence.toFixed(2)} is below 0.8 — waiting for user choice`
      : `Decision "${task.name}": no match — waiting for user choice`;
    const note =
      modelError ??
      (lowConfidence
        ? `The model's confidence (${confidence.toFixed(2)}) is below 0.8. Pick the option that should have won.`
        : undefined);

    return {
      ok: true,
      outcome: {
        status: "awaiting_choice",
        pendingChoice,
        result: {
          answer: answer ?? null,
          effectiveAnswer: effectiveAnswer ?? null,
          normalizedConfidence: confidence,
          lowConfidence,
          matchedResultId: null,
          usage: response?.usage ?? null,
          model,
          branch: "awaiting_user",
          recommendedOptionId: null,
          summary,
          ...(note ? { note } : {}),
        },
        summary,
        nextSteps: [],
      },
    };
  }

  if (!answer || !effectiveAnswer) {
    return {
      ok: false,
      note:
        modelError ??
        `no answer returned for premise "${decision.decisionPremise}"`,
    };
  }

  const summary = summarizeAnswer(task.name, effectiveAnswer);
  const nextTaskId = task.fallbackTaskId ?? null;
  const branch: "fallback" | "none" =
    nextTaskId != null ? "fallback" : "none";
  let note =
    nextTaskId == null
      ? "no matching result and no fallback — run finished"
      : undefined;

  let nextSteps: QueuedStepInsert[] = [];
  if (nextTaskId != null) {
    if (row.depth >= MAX_CHAIN_DEPTH) {
      const maxNote = `max chain depth (${MAX_CHAIN_DEPTH}) reached — run stopped`;
      note = note ? `${note}; ${maxNote}` : maxNote;
    } else {
      nextSteps = [
        {
          taskId: nextTaskId,
          state: row.state,
          toolState: row.toolState,
          depth: row.depth + 1,
          parentQueuedTaskId: row.id,
          runId: row.runId,
          queued_by: row.queued_by,
          ...inheritedForkFields(row),
        },
      ];
    }
  }

  return {
    ok: true,
    outcome: {
      status: "completed",
      result: {
        answer,
        effectiveAnswer,
        normalizedConfidence: confidence,
        matchedResultId: null,
        usage: response?.usage ?? null,
        model,
        branch,
        nextTaskId,
        summary,
        ...(note ? { note } : {}),
      },
      summary,
      nextSteps,
    },
  };
}

/** Executes a decision task and enqueues the matching/fallback next step. */
export async function processDecisionStep(
  row: QueuedRow,
  task: TaskRow,
): Promise<void> {
  const execution = await executeDecisionAttempt(row, task);

  if (!execution.ok) {
    await finishStep(row.id, "failed", { note: execution.note });
    return;
  }

  const { outcome } = execution;

  if (outcome.status === "awaiting_target" && outcome.pendingChoice) {
    await awaitStep(
      row.id,
      outcome.pendingChoice,
      outcome.result,
      outcome.summary,
    );
    return;
  }

  if (outcome.status === "awaiting_choice" && outcome.pendingChoice) {
    await awaitStep(
      row.id,
      outcome.pendingChoice,
      outcome.result,
      outcome.summary,
    );
    return;
  }

  if (outcome.nextSteps.length > 0) {
    await enqueueSteps(outcome.nextSteps);
  }

  await finishStep(row.id, "completed", outcome.result, outcome.summary);
}
