/**
 * A decision premise is the key the System One model answers under, so it must
 * stay short: one word, optionally two. Sentences and questions make the
 * answer payload hard to match and are not valid premises.
 */
export const MAX_DECISION_PREMISE_WORDS = 2;

export function decisionPremiseWords(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

export function isValidDecisionPremise(value: string): boolean {
  const words = decisionPremiseWords(value);
  return words.length > 0 && words.length <= MAX_DECISION_PREMISE_WORDS;
}

/**
 * Returns a valid premise closest to the supplied text.
 *
 * The optimizer is asked for a short word, but a model that ignores the
 * instruction must never overwrite a good premise with a sentence. Prefer the
 * candidate when it already fits, then the current premise, then a compact
 * fallback derived from the candidate.
 */
export function coerceDecisionPremise(
  candidate: string,
  current?: string | null,
): string {
  const trimmed = candidate.trim();
  if (isValidDecisionPremise(trimmed)) {
    return decisionPremiseWords(trimmed).join(" ");
  }

  if (current && isValidDecisionPremise(current)) {
    return decisionPremiseWords(current).join(" ");
  }

  const words = decisionPremiseWords(trimmed);
  if (words.length === 0) return "decision";
  // Drop trailing punctuation and keep the last meaningful word; sentences
  // usually end in the action or object the decision is about.
  const last = words[words.length - 1]!.replace(/[^\p{L}\p{N}_-]+/gu, "");
  return last || words[0]!.replace(/[^\p{L}\p{N}_-]+/gu, "") || "decision";
}
