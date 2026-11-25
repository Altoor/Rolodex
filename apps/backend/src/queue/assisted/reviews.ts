import { db } from "@repo/db";
import type { TaskSnapshot } from "../../assisted/attempts";
import type { TaskRow } from "../types";
import type { PendingChoice, PendingChoiceOption } from "../user-choice";
import { decisionResultLabel } from "../user-choice";

/** Builds the review prompt shown for a completed decision attempt. */
export async function buildDecisionReview(
  task: TaskRow,
  result: Record<string, unknown>,
  snapshot?: TaskSnapshot,
): Promise<PendingChoice> {
  const results = (
    snapshot?.results ??
    (await db.query.taskResults.findMany({ where: { taskId: task.id } }))
  ).sort((a, b) => a.id - b.id);

  const options: PendingChoiceOption[] = results.map((entry, index) => ({
    id: `result:${entry.id}`,
    label: decisionResultLabel(entry, index, entry.type),
    value: entry.option ?? entry.scoreThreshold ?? entry.probabilityThreshold,
    resultTaskId: entry.resultTaskId,
    appendState: entry.appendState,
    source: "decisionResult" as const,
  }));

  const chosen = result.matchedResultId
    ? options.find((option) => option.id === `result:${result.matchedResultId}`)
    : undefined;
  const needsChoice = chosen == null || result.lowConfidence === true;

  return {
    kind: "assistedDecisionReview",
    taskId: task.id,
    prompt: needsChoice
      ? "The model did not make a confident match. Pick the option that should have won."
      : "Is this the right choice?",
    choiceType: "list",
    acceptLabel: needsChoice ? "Pick an option" : "Yes, use this choice",
    recommendedOptionId: chosen?.id ?? null,
    options,
    createdAt: new Date().toISOString(),
  };
}

/** Builds the review prompt for a decision whose option has no next task. */
export function buildDecisionTargetReview(
  task: TaskRow,
  outcome: { result: Record<string, unknown> },
): PendingChoice {
  const option =
    typeof outcome.result.unwiredOption === "string" &&
    outcome.result.unwiredOption.trim()
      ? outcome.result.unwiredOption
      : "This choice";

  return {
    kind: "assistedDecisionTarget",
    taskId: task.id,
    prompt: `The model chose "${option}", but this option has no next task yet.`,
    choiceType: "list",
    acceptLabel: "Continue",
    recommendedOptionId: null,
    options: [],
    createdAt: new Date().toISOString(),
  };
}
