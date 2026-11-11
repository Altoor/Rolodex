export type WhereOperator = "eq" | "has" | "lgt" | "smt";

export interface WhereComparison {
  /** Dot/bracket path relative to a tool-state entry. */
  path: string;
  /** Required for eq/lgt/smt; ignored for has. */
  value?: unknown;
  /** Sugar for { not: <this comparison> }. */
  negate?: boolean;
}

/** Recursive condition tree. */
export type WhereExpression =
  | { eq: WhereComparison }
  | { has: WhereComparison }
  | { lgt: WhereComparison }
  | { smt: WhereComparison }
  | { all: WhereExpression[] }
  | { any: WhereExpression[] }
  | { not: WhereExpression };

export interface WhereEvaluation {
  matched: boolean;
  results: Array<{ entry: unknown; matched: boolean }>;
  evaluated: number;
  matchedCount: number;
}

export interface EvaluateWhereOptions {
  quantifier?: "some" | "every";
}

export const EXPRESSION_KEYS = [
  "eq",
  "has",
  "lgt",
  "smt",
  "all",
  "any",
  "not",
] as const;

export const MAX_DEPTH = 20;
