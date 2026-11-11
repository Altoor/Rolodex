import type { SystemOneAnswer } from "ollama";
import type { TaskResultRow } from "./types";

export type PendingChoiceKind = "userDecision" | "decisionOutput";
export type PendingChoiceType = "yesNo" | "list" | "dropdown";
export type PendingChoiceOptionSource = "static" | "dynamic" | "decisionResult";

export interface PendingChoiceOption {
  id: string;
  label: string;
  description?: string;
  /** Value appended to toolState and stored on the answered step. */
  value: unknown;
  resultTaskId: number | null;
  appendState: boolean;
  source: PendingChoiceOptionSource;
}

export interface PendingChoice {
  kind: PendingChoiceKind;
  taskId: number;
  prompt: string;
  choiceType: PendingChoiceType;
  acceptLabel: string;
  recommendedOptionId?: string | null;
  options: PendingChoiceOption[];
  createdAt: string;
}

/** Human-readable label for a decision result branch. */
export function decisionResultLabel(
  result: TaskResultRow,
  index: number,
  decisionType: string | null,
): string {
  const parts: string[] = [];

  if (decisionType === "score") {
    if (result.scoreThreshold != null) {
      parts.push(`Score ≥ ${result.scoreThreshold}`);
    }
  } else {
    parts.push(result.option ?? `Result ${index + 1}`);
    if (decisionType === "choice" && result.probabilityThreshold != null) {
      parts.push(`P ≥ ${result.probabilityThreshold}`);
    }
  }

  if (result.confidenceThreshold != null) {
    parts.push(`C ≥ ${result.confidenceThreshold}`);
  }

  return parts.length > 0 ? parts.join(" · ") : `Result ${index + 1}`;
}

/**
 * Produces the value a forced decision step appends when the user picks a
 * result that the model did not choose. Choice results override the chosen
 * option; score/noul results keep the model score and record the selection.
 */
export function decisionResultValue(
  result: TaskResultRow,
  answer: SystemOneAnswer | null,
): unknown {
  if (answer && answer.type === result.type) {
    if (answer.type === "choice" && result.option != null) {
      return { ...answer, choice: result.option, selectedResultId: result.id };
    }

    return { ...answer, selectedResultId: result.id };
  }

  // The user can pick an output that differs from the model's answer type;
  // record a value shaped like the selected result instead.
  if (result.type === "choice") {
    return {
      type: "choice",
      choice: result.option,
      selectedResultId: result.id,
    };
  }

  if (result.type === "score") {
    return {
      type: "score",
      score: result.scoreThreshold ?? 0,
      selectedResultId: result.id,
    };
  }

  return {
    type: "noul",
    noul: result.probabilityThreshold ?? result.confidenceThreshold ?? 0,
    selectedResultId: result.id,
  };
}
