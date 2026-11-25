import { describe, expect, it } from "vitest";
import type { SystemOneAnswer } from "ollama";
import {
  ASSISTED_CONFIDENCE_FLOOR,
  meetsAssistedConfidence,
  normalizedConfidence,
  preserveChoiceOptions,
} from "./decision";

describe("normalizedConfidence", () => {
  it("uses the choice confidence directly", () => {
    const answer = {
      type: "choice",
      choice: "A",
      probabilities: { A: 0.9 },
      confidence: 0.9,
    } as SystemOneAnswer;

    expect(normalizedConfidence(answer)).toBe(0.9);
    expect(meetsAssistedConfidence(answer)).toBe(true);
  });

  it("uses the noul probability", () => {
    const answer = { type: "noul", noul: 0.55, confidence: 0.9 } as SystemOneAnswer;
    expect(normalizedConfidence(answer)).toBe(0.55);
    expect(meetsAssistedConfidence(answer)).toBe(false);
  });

  it("normalizes score by the legend size", () => {
    const answer = {
      type: "score",
      score: 4,
      legend: { "0": "none", "1": "low", "2": "mid", "3": "high", "4": "max" },
      probabilities: {},
      confidence: 0.9,
    } as SystemOneAnswer;

    expect(normalizedConfidence(answer)).toBe(1);
    expect(meetsAssistedConfidence(answer)).toBe(true);
  });

  it("clamps out-of-range values", () => {
    const answer = {
      type: "choice",
      choice: "A",
      probabilities: {},
      confidence: 1.4,
    } as SystemOneAnswer;

    expect(normalizedConfidence(answer)).toBe(1);
    expect(ASSISTED_CONFIDENCE_FLOOR).toBe(0.8);
  });
});

describe("preserveChoiceOptions", () => {
  it("keeps original option strings and adopts matching descriptions", () => {
    const result = preserveChoiceOptions(
      ["files", "todos"],
      ["old files", "old todos"],
      ["files", "todos"],
      ["new files", "new todos"],
    );

    expect(result).toEqual({
      options: ["files", "todos"],
      optionDescriptions: ["new files", "new todos"],
    });
  });

  it("ignores renamed options instead of adding an unwired choice", () => {
    const result = preserveChoiceOptions(
      ["files", "todos"],
      ["old files", "old todos"],
      ["files and folders", "todos"],
      ["renamed files", "new todos"],
    );

    expect(result).toEqual({
      options: ["files", "todos"],
      optionDescriptions: ["old files", "new todos"],
    });
  });

  it("passes proposals through when there are no original options", () => {
    const result = preserveChoiceOptions(
      null,
      null,
      ["A", "B"],
      ["first", "second"],
    );

    expect(result).toEqual({
      options: ["A", "B"],
      optionDescriptions: ["first", "second"],
    });
  });
});
