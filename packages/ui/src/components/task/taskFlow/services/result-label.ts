import type { FlowTaskResult } from "../taskFlowTypes";

/** Human-readable label for one result output handle. */
export function resultLabel(
  result: FlowTaskResult,
  decisionType: string | null,
  index: number,
): string {
  // "P:" only applies to choice decisions and "S:" only to score decisions.
  // Each threshold is only shown when it is defined; confidence ("C:") is a
  // modifier shown alongside for any decision type.
  const parts: string[] = [];
  if (decisionType === "score") {
    if (result.scoreThreshold != null) {
      parts.push(`S: ${result.scoreThreshold}`);
    }
  } else {
    parts.push(result.option ?? `Result ${index + 1}`);
    if (decisionType === "choice" && result.probabilityThreshold != null) {
      parts.push(`P: ${result.probabilityThreshold}`);
    }
  }
  if (result.confidenceThreshold != null) {
    parts.push(`C: ${result.confidenceThreshold}`);
  }
  return parts.length > 0 ? parts.join(" · ") : `Result ${index + 1}`;
}
