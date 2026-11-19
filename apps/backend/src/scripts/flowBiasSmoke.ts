import assert from "node:assert/strict";
import type { SystemOneAnswer } from "ollama";
import {
  applyDecisionBiases,
  planBiasDeltas,
  NOUL_BIAS_KEY,
  SCORE_BIAS_KEY,
} from "../queue/decision-bias";
import type { TaskResultRow } from "../queue/types";

function choiceAnswer(
  choice: string,
  probabilities: Record<string, number>,
  confidence = probabilities[choice] ?? 0,
): SystemOneAnswer {
  return { type: "choice", choice, probabilities, confidence };
}

function result(overrides: Partial<TaskResultRow>): TaskResultRow {
  return {
    id: 1,
    taskId: 1,
    type: "choice",
    option: null,
    scoreThreshold: null,
    probabilityThreshold: null,
    confidenceThreshold: null,
    resultTaskId: null,
    appendState: false,
    ...overrides,
  };
}

// No biases leave the answer untouched.
const raw = choiceAnswer("refund", { refund: 0.7, technical: 0.3 });
const unchanged = applyDecisionBiases(raw, new Map());
assert.equal(unchanged.answer, raw);

// A positive bias can flip the chosen option and renormalizes probabilities.
const biased = applyDecisionBiases(
  raw,
  new Map([["technical", 0.5]]),
  ["refund", "technical"],
);
assert.equal(biased.answer.type, "choice");
if (biased.answer.type === "choice") {
  assert.equal(biased.answer.choice, "technical");
  const total = Object.values(biased.answer.probabilities).reduce(
    (sum, value) => sum + value,
    0,
  );
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.ok(
    Math.abs(biased.answer.confidence - biased.answer.probabilities.technical!) <
      1e-9,
  );
}

// Probabilities never go below zero.
const floored = applyDecisionBiases(
  raw,
  new Map([["refund", -5]]),
  ["refund", "technical"],
);
if (floored.answer.type === "choice") {
  assert.ok(floored.answer.probabilities.refund! >= 0);
}

// Score and noul biases shift and clamp.
const scoreAnswer: SystemOneAnswer = {
  type: "score",
  score: 0.4,
  confidence: 0.8,
  legend: { low: "low", high: "high" },
  probabilities: { low: 0.6, high: 0.4 },
};
const scoreBiased = applyDecisionBiases(
  scoreAnswer,
  new Map([[SCORE_BIAS_KEY, 0.3]]),
);
if (scoreBiased.answer.type === "score") {
  assert.ok(Math.abs(scoreBiased.answer.score - 0.7) < 1e-9);
}
const scoreClamped = applyDecisionBiases(
  scoreAnswer,
  new Map([[SCORE_BIAS_KEY, 5]]),
);
if (scoreClamped.answer.type === "score") {
  assert.equal(scoreClamped.answer.score, 1);
}

const noulAnswer: SystemOneAnswer = { type: "noul", noul: 0.4 };
const noulBiased = applyDecisionBiases(
  noulAnswer,
  new Map([[NOUL_BIAS_KEY, 0.2]]),
);
if (noulBiased.answer.type === "noul") {
  assert.ok(Math.abs(noulBiased.answer.noul - 0.6) < 1e-9);
}
const noulClamped = applyDecisionBiases(
  noulAnswer,
  new Map([[NOUL_BIAS_KEY, -5]]),
);
if (noulClamped.answer.type === "noul") {
  assert.equal(noulClamped.answer.noul, 0);
}

// Choice corrections reward the correct option and penalize the predicted one.
const deltas = planBiasDeltas(
  raw,
  raw,
  result({ option: "refund", type: "choice" }),
  result({ option: "technical", type: "choice" }),
);
assert.deepEqual(deltas, [
  { key: "technical", delta: 0.05 },
  { key: "refund", delta: -0.025 },
]);

// Score corrections move toward the correct threshold.
const scoreDeltas = planBiasDeltas(
  scoreAnswer,
  scoreAnswer,
  result({ type: "score", scoreThreshold: 0.2 }),
  result({ type: "score", scoreThreshold: 0.8 }),
);
assert.deepEqual(scoreDeltas, [{ key: SCORE_BIAS_KEY, delta: 0.05 }]);

// Noul corrections use probabilityThreshold, then confidenceThreshold.
const noulDeltas = planBiasDeltas(
  noulAnswer,
  noulAnswer,
  result({ type: "noul", probabilityThreshold: 0.8 }),
  result({ type: "noul", probabilityThreshold: 0.2 }),
);
assert.deepEqual(noulDeltas, [{ key: NOUL_BIAS_KEY, delta: -0.05 }]);

console.log("flowBiasSmoke: all bias checks passed");
