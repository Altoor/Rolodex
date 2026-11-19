import type {
  SystemOneAnswer,
  SystemOneChoiceAnswer,
  SystemOneNoulAnswer,
  SystemOneScoreAnswer,
} from "ollama";
import { eq, and } from "drizzle-orm";
import { db, decisionBiases } from "@repo/db";
import type { TaskResultRow } from "./types";

export const SCORE_BIAS_KEY = "__score__";
export const NOUL_BIAS_KEY = "__noul__";
export const DEFAULT_BIAS_DELTA = 0.05;
export const MAX_ABSOLUTE_BIAS = 0.5;

export type BiasMap = Map<string, number>;

export interface AppliedBias {
  key: string;
  bias: number;
}

export interface BiasDelta {
  key: string;
  delta: number;
}

export interface BiasedAnswer {
  answer: SystemOneAnswer;
  applied: AppliedBias[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hasAnyBias(biases: BiasMap): boolean {
  for (const value of biases.values()) {
    if (value !== 0) return true;
  }
  return false;
}

function applyChoiceBiases(
  answer: SystemOneChoiceAnswer,
  biases: BiasMap,
  optionOrder: string[] | undefined,
): BiasedAnswer {
  const rawProbabilities = answer.probabilities ?? {};
  const shifted = Object.fromEntries(
    Object.entries(rawProbabilities).map(([option, probability]) => [
      option,
      Math.max(0, probability + (biases.get(option) ?? 0)),
    ]),
  );

  const total = Object.values(shifted).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { answer, applied: [] };

  const probabilities = Object.fromEntries(
    Object.entries(shifted).map(([option, value]) => [option, value / total]),
  );

  const orderedOptions = optionOrder?.length
    ? [...optionOrder].filter((option) => option in probabilities)
    : Object.keys(probabilities);

  for (const option of Object.keys(probabilities)) {
    if (!orderedOptions.includes(option)) orderedOptions.push(option);
  }

  let choice = orderedOptions[0] ?? answer.choice;
  let best = probabilities[choice] ?? 0;

  for (const option of orderedOptions) {
    const probability = probabilities[option] ?? 0;
    if (probability > best + Number.EPSILON) {
      choice = option;
      best = probability;
    }
  }

  // Keep the raw choice on an exact tie when no bias actually changed it.
  if (
    Object.prototype.hasOwnProperty.call(probabilities, answer.choice) &&
    Math.abs((probabilities[answer.choice] ?? 0) - best) <= Number.EPSILON
  ) {
    choice = answer.choice;
    best = probabilities[choice] ?? best;
  }

  const applied = Object.entries(rawProbabilities)
    .filter(([option]) => (biases.get(option) ?? 0) !== 0)
    .map(([option]) => ({ key: option, bias: biases.get(option) ?? 0 }));

  return {
    answer: {
      ...answer,
      choice,
      probabilities,
      confidence: best,
    },
    applied,
  };
}

function applyScoreBiases(
  answer: SystemOneScoreAnswer,
  biases: BiasMap,
): BiasedAnswer {
  const bias = biases.get(SCORE_BIAS_KEY) ?? 0;
  if (bias === 0) return { answer, applied: [] };

  const legendSize = Object.keys(answer.legend ?? {}).length;
  const maxScore = Math.max(0, legendSize - 1);
  const score = clamp(answer.score + bias, 0, maxScore);

  return {
    answer: { ...answer, score },
    applied: [{ key: SCORE_BIAS_KEY, bias }],
  };
}

function applyNoulBiases(
  answer: SystemOneNoulAnswer,
  biases: BiasMap,
): BiasedAnswer {
  const bias = biases.get(NOUL_BIAS_KEY) ?? 0;
  if (bias === 0) return { answer, applied: [] };

  return {
    answer: { ...answer, noul: clamp(answer.noul + bias, 0, 1) },
    applied: [{ key: NOUL_BIAS_KEY, bias }],
  };
}

/**
 * Applies learned bias to a System One answer. Matching uses the returned
 * answer; the original answer is never mutated.
 */
export function applyDecisionBiases(
  answer: SystemOneAnswer,
  biases: BiasMap,
  optionOrder?: string[],
): BiasedAnswer {
  if (!hasAnyBias(biases)) return { answer, applied: [] };

  switch (answer.type) {
    case "choice":
      return applyChoiceBiases(answer, biases, optionOrder);
    case "score":
      return applyScoreBiases(answer, biases);
    case "noul":
      return applyNoulBiases(answer, biases);
  }
}

function direction(value: number | null | undefined, target: number): 1 | -1 {
  if (value == null || !Number.isFinite(value)) return 1;
  if (target > value) return 1;
  if (target < value) return -1;
  return 1;
}

/**
 * Plans the bias changes for a user correction. A choice correction rewards the
 * correct option and slightly penalizes the predicted one. Score/noul move the
 * scalar toward the correct result's threshold.
 */
export function planBiasDeltas(
  rawAnswer: SystemOneAnswer,
  effectiveAnswer: SystemOneAnswer,
  predictedResult: TaskResultRow | null,
  actualResult: TaskResultRow,
  delta = DEFAULT_BIAS_DELTA,
): BiasDelta[] {
  if (effectiveAnswer.type === "choice") {
    const correctOption = actualResult.option;
    if (!correctOption) return [];

    const predictedOption =
      predictedResult?.option ??
      (rawAnswer.type === "choice" ? rawAnswer.choice : null);
    const deltas: BiasDelta[] = [{ key: correctOption, delta }];

    if (predictedOption && predictedOption !== correctOption) {
      deltas.push({ key: predictedOption, delta: -delta / 2 });
    }

    return deltas;
  }

  if (effectiveAnswer.type === "score") {
    if (actualResult.scoreThreshold == null) return [];
    const sign = direction(
      effectiveAnswer.score,
      actualResult.scoreThreshold,
    );
    return [{ key: SCORE_BIAS_KEY, delta: delta * sign }];
  }

  if (effectiveAnswer.type === "noul") {
    const target =
      actualResult.probabilityThreshold ?? actualResult.confidenceThreshold;
    if (target == null) return [];
    const sign = direction(effectiveAnswer.noul, target);
    return [{ key: NOUL_BIAS_KEY, delta: delta * sign }];
  }

  return [];
}

export async function loadDecisionBiases(
  decisionId: number,
): Promise<BiasMap> {
  const rows = await db
    .select()
    .from(decisionBiases)
    .where(eq(decisionBiases.decisionId, decisionId));

  return new Map(rows.map((row) => [row.option, row.bias]));
}

/** Applies deltas in one transaction, clamping each stored bias. */
export async function applyBiasDeltas(
  decisionId: number,
  deltas: BiasDelta[],
): Promise<void> {
  if (deltas.length === 0) return;

  await db.transaction(async (tx) => {
    await applyBiasDeltasWith(tx, decisionId, deltas);
  });
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Transaction-aware variant used by review/idempotency flows. */
export async function applyBiasDeltasWith(
  tx: DbTransaction,
  decisionId: number,
  deltas: BiasDelta[],
): Promise<void> {
  for (const entry of deltas) {
    if (!Number.isFinite(entry.delta) || entry.delta === 0) continue;

    const [existing] = await tx
      .select()
      .from(decisionBiases)
      .where(
        and(
          eq(decisionBiases.decisionId, decisionId),
          eq(decisionBiases.option, entry.key),
        ),
      )
      .limit(1);

    const next = clamp(
      (existing?.bias ?? 0) + entry.delta,
      -MAX_ABSOLUTE_BIAS,
      MAX_ABSOLUTE_BIAS,
    );

    await tx
      .insert(decisionBiases)
      .values({
        decisionId,
        option: entry.key,
        bias: next,
      })
      .onConflictDoUpdate({
        target: [decisionBiases.decisionId, decisionBiases.option],
        set: { bias: next, updatedAt: new Date() },
      });
  }
}
