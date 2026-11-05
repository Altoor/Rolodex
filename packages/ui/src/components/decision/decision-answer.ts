type NumberRecord = Record<string, number>;
type StringRecord = Record<string, string>;

const asNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : Number(value) || 0;

const toNumberRecord = (value: unknown): NumberRecord => {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      asNumber(entry),
    ]),
  );
};

const toStringRecord = (value: unknown): StringRecord => {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === "string" ? entry : String(entry ?? ""),
    ]),
  );
};

export type SystemOneAnswer =
  | {
      type: "choice";
      confidence: number;
      probabilities: NumberRecord;
    }
  | {
      type: "score";
      score: number;
      confidence: number;
      legend: StringRecord;
      probabilities: NumberRecord;
    }
  | { type: "noul"; noul: number };

/**
 * The GraphQL `answer` field is a JSON scalar keyed by the decision premise.
 * This adapter is the single place that narrows that unknown value.
 */
export const readSystemOneAnswer = (
  answer: unknown,
  decisionPremise: string,
): SystemOneAnswer | undefined => {
  if (!answer || typeof answer !== "object") return undefined;

  const entry = (answer as Record<string, unknown>)[decisionPremise];
  if (!entry || typeof entry !== "object") return undefined;

  const record = entry as Record<string, unknown>;

  if (typeof record.choice === "string") {
    return {
      type: "choice",
      confidence: asNumber(record.confidence),
      probabilities: toNumberRecord(record.probabilities),
    };
  }

  if (typeof record.score === "number") {
    return {
      type: "score",
      score: record.score,
      confidence: asNumber(record.confidence),
      legend: toStringRecord(record.legend),
      probabilities: toNumberRecord(record.probabilities),
    };
  }

  if (typeof record.noul === "number") {
    return { type: "noul", noul: record.noul };
  }

  return undefined;
};
