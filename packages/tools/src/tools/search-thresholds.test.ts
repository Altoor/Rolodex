import { describe, expect, it } from "vitest";
import type {
  SystemOneChoiceAnswer,
  SystemOneNoulAnswer,
  SystemOneScoreAnswer,
} from "ollama";
import { ToolNoMatchError } from "../model";
import {
  answerConfidence,
  assertMinimumConfidence,
  passesMinimumScore,
  readMinimumThreshold,
} from "./search-thresholds";

const choice: SystemOneChoiceAnswer = {
  type: "choice",
  choice: "File A",
  probabilities: { "File A": 0.7, none: 0.3 },
  confidence: 0.7,
};

const score: SystemOneScoreAnswer = {
  type: "score",
  score: 2,
  legend: {},
  probabilities: {},
  confidence: 0.55,
};

const noul: SystemOneNoulAnswer = { type: "noul", noul: 0.42 };

describe("passesMinimumScore", () => {
  it("accepts scores at or above the minimum", () => {
    expect(passesMinimumScore(0.7, 0.7)).toBe(true);
    expect(passesMinimumScore(0.8, 0.7)).toBe(true);
  });

  it("rejects scores below the minimum", () => {
    expect(passesMinimumScore(0.69, 0.7)).toBe(false);
    expect(passesMinimumScore(-0.1, 0)).toBe(false);
  });
});

describe("readMinimumThreshold", () => {
  it("uses the fallback when the key is absent", () => {
    expect(readMinimumThreshold({}, "minimumScore", 0.2)).toBe(0.2);
  });

  it("accepts values from 0 through 1", () => {
    expect(readMinimumThreshold({ minimumScore: 0 }, "minimumScore", 0)).toBe(
      0,
    );
    expect(
      readMinimumThreshold({ minimumConfidence: 1 }, "minimumConfidence", 0),
    ).toBe(1);
  });

  it("rejects values outside the 0..1 range", () => {
    expect(() =>
      readMinimumThreshold({ minimumScore: 1.1 }, "minimumScore", 0),
    ).toThrow(/"minimumScore" must be between 0 and 1/);
    expect(() =>
      readMinimumThreshold({ minimumConfidence: -0.1 }, "minimumConfidence", 0),
    ).toThrow(/"minimumConfidence" must be between 0 and 1/);
  });
});

describe("answerConfidence", () => {
  it("reads confidence for choice and score answers", () => {
    expect(answerConfidence(choice)).toBe(0.7);
    expect(answerConfidence(score)).toBe(0.55);
  });

  it("reads the noul probability for noul answers", () => {
    expect(answerConfidence(noul)).toBe(0.42);
  });
});

describe("assertMinimumConfidence", () => {
  it("returns the confidence when the answer meets the minimum", () => {
    expect(assertMinimumConfidence(choice, 0.7, "file")).toBe(0.7);
    expect(assertMinimumConfidence(noul, 0.4, "todo")).toBe(0.42);
  });

  it("throws a no-match error when the answer is below the minimum", () => {
    expect(() => assertMinimumConfidence(choice, 0.8, "file")).toThrow(
      ToolNoMatchError,
    );
    expect(() => assertMinimumConfidence(noul, 0.5, "todo")).toThrow(
      /below the minimum of 0.50/,
    );
  });
});
