import type {
  SystemOneAnswer,
  SystemOneChoiceAnswer,
  SystemOneNoulAnswer,
  SystemOneScoreAnswer,
} from "ollama";
import type { TaskResultRow } from "./types";

/**
 * Checks one taskResult's thresholds against a SystemOne answer.
 * Every threshold that is set must pass.
 */
export function resultMatches(
  r: TaskResultRow,
  answer: SystemOneAnswer,
): boolean {
  switch (answer.type) {
    case "choice": {
      const a = answer as SystemOneChoiceAnswer;
      if (r.option != null && r.option !== a.choice) return false;
      if (r.probabilityThreshold != null) {
        const p = a.probabilities[a.choice] ?? 0;
        if (p < r.probabilityThreshold) return false;
      }
      if (r.confidenceThreshold != null && a.confidence < r.confidenceThreshold)
        return false;
      return true;
    }
    case "score": {
      const a = answer as SystemOneScoreAnswer;
      if (r.scoreThreshold != null && a.score < r.scoreThreshold) return false;
      if (r.confidenceThreshold != null && a.confidence < r.confidenceThreshold)
        return false;
      return true;
    }
    case "noul": {
      const a = answer as SystemOneNoulAnswer;
      // A noul answer only carries the noul probability, and noul results
      // expose a single threshold knob, so whichever threshold column is
      // set applies to the noul probability.
      const threshold = r.probabilityThreshold ?? r.confidenceThreshold;
      if (threshold != null && a.noul < threshold) return false;
      return true;
    }
    default:
      return false;
  }
}

export function summarizeAnswer(
  taskName: string,
  answer: SystemOneAnswer,
): string {
  switch (answer.type) {
    case "choice":
      return `Decision "${taskName}": chose "${answer.choice}" (confidence ${answer.confidence})`;
    case "score":
      return `Decision "${taskName}": scored ${answer.score} (confidence ${answer.confidence})`;
    case "noul":
      return `Decision "${taskName}": noul probability ${answer.noul}`;
  }
}
