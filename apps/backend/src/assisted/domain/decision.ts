import type { SystemOneAnswer } from "ollama";

/** Confidence floor for assisted decision review and generated thresholds. */
export const ASSISTED_CONFIDENCE_FLOOR = 0.8;

/**
 * Normalizes the model's confidence to 0..1 so assisted review can enforce a
 * single floor regardless of decision type.
 */
export function normalizedConfidence(answer: SystemOneAnswer): number {
  switch (answer.type) {
    case "choice":
      return Math.max(0, Math.min(1, answer.confidence));
    case "noul":
      return Math.max(0, Math.min(1, answer.noul));
    case "score": {
      const legendSize = Object.keys(answer.legend ?? {}).length;
      return Math.max(
        0,
        Math.min(1, answer.score / Math.max(1, legendSize - 1)),
      );
    }
  }
}

/** True when a decision answer is confident enough for assisted review. */
export function meetsAssistedConfidence(answer: SystemOneAnswer): boolean {
  return normalizedConfidence(answer) >= ASSISTED_CONFIDENCE_FLOOR;
}

/**
 * The optimizer may rewrite explanations but must not rename or add choice
 * options. Every choice option is wired to a `taskResults` row by exact string
 * match, so a renamed option would be selectable by the model yet impossible to
 * match, producing a false “no match”. Keep the original option list and only
 * adopt descriptions the model returned for those same option names.
 */
export function preserveChoiceOptions(
  originalOptions: string[] | null | undefined,
  originalDescriptions: string[] | null | undefined,
  proposedOptions: string[],
  proposedDescriptions: string[],
): { options: string[]; optionDescriptions: string[] } {
  if (!originalOptions || originalOptions.length === 0) {
    return {
      options: [...proposedOptions],
      optionDescriptions: [...proposedDescriptions],
    };
  }

  return {
    options: [...originalOptions],
    optionDescriptions: originalOptions.map((option, index) => {
      const proposedIndex = proposedOptions.indexOf(option);
      if (proposedIndex >= 0) {
        return (
          proposedDescriptions[proposedIndex] ??
          originalDescriptions?.[index] ??
          ""
        );
      }
      return originalDescriptions?.[index] ?? "";
    }),
  };
}
