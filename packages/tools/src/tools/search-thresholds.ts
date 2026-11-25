import type { SystemOneAnswer } from "ollama";
import { readNumber } from "../utils";
import { ToolInputError, ToolNoMatchError } from "../model";

/** Defaults keep existing tasks permissive; set the keys to tighten a lookup. */
export const DEFAULT_MINIMUM_SCORE = 0;
export const DEFAULT_MINIMUM_CONFIDENCE = 0;

export type MinimumThresholdKey = "minimumScore" | "minimumConfidence";

/** Reads a 0..1 threshold from merged tool input, falling back to the default. */
export function readMinimumThreshold(
  input: Record<string, unknown>,
  key: MinimumThresholdKey,
  fallback: number,
): number {
  const value = readNumber(input, key);
  if (value === undefined) return fallback;
  if (value < 0 || value > 1) {
    throw new ToolInputError(`"${key}" must be between 0 and 1`);
  }
  return value;
}

/**
 * Vector similarity must reach this score before a candidate is returned
 * without asking the decision model.
 */
export function passesMinimumScore(
  score: number,
  minimumScore: number,
): boolean {
  return score >= minimumScore;
}

/** Choice/score answers report confidence; noul reports the true probability. */
export function answerConfidence(answer: SystemOneAnswer): number {
  switch (answer.type) {
    case "choice":
      return answer.confidence;
    case "score":
      return answer.confidence;
    case "noul":
      return answer.noul;
  }
}

/**
 * Rejects a decision-model answer below the configured confidence, so callers
 * can treat it like any other miss (including `allowEmpty`).
 */
export function assertMinimumConfidence(
  answer: SystemOneAnswer,
  minimumConfidence: number,
  label: string,
): number {
  const confidence = answerConfidence(answer);
  if (!Number.isFinite(confidence)) {
    throw new ToolNoMatchError(
      `${label} selection did not return a confidence`,
    );
  }
  if (confidence < minimumConfidence) {
    throw new ToolNoMatchError(
      `${label} selection confidence ${confidence.toFixed(2)} is below the minimum of ${minimumConfidence.toFixed(2)}`,
    );
  }
  return confidence;
}
