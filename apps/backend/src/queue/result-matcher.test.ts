import { describe, expect, it } from "vitest";
import type { SystemOneAnswer } from "ollama";
import { findMatchingResult } from "./result-matcher";
import type { TaskResultRow } from "./types";

const answer = {
  type: "choice",
  choice: "both",
  probabilities: { both: 0.98, files: 0.01, folders: 0.01 },
  confidence: 0.97,
} as SystemOneAnswer;

function result(overrides: Partial<TaskResultRow> = {}): TaskResultRow {
  return {
    id: 1,
    taskId: 1,
    type: "choice",
    option: "both",
    scoreThreshold: null,
    probabilityThreshold: null,
    confidenceThreshold: null,
    resultTaskId: null,
    appendState: false,
    ...overrides,
  } as TaskResultRow;
}

describe("findMatchingResult", () => {
  it("matches a wired result by option", () => {
    const wired = result({ id: 2, resultTaskId: 99 });
    expect(findMatchingResult([wired], answer)).toBe(wired);
  });

  it("skips an unwired result unless assisted runs allow it", () => {
    const unwired = result({ id: 3 });
    expect(findMatchingResult([unwired], answer)).toBeUndefined();
    expect(findMatchingResult([unwired], answer, { allowUnwired: true })).toBe(
      unwired,
    );
  });

  it("still honours probability thresholds", () => {
    const unwired = result({ id: 4, probabilityThreshold: 0.99 });
    expect(
      findMatchingResult([unwired], answer, { allowUnwired: true }),
    ).toBeUndefined();
  });
});
