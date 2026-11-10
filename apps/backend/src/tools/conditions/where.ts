import { ToolInputError } from "../types";

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

const EXPRESSION_KEYS = [
  "eq",
  "has",
  "lgt",
  "smt",
  "all",
  "any",
  "not",
] as const;

const MAX_DEPTH = 20;

export interface EvaluateWhereOptions {
  quantifier?: "some" | "every";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Resolves a dotted/bracket path against an arbitrary value. Supports paths
 * such as `data.todos.0.done` and `output.todos[0].name`.
 */
export function readPath(source: unknown, path: string): unknown {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  const segments = normalized.split(".").filter((segment) => segment.length > 0);

  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;

  const leftNumber = asFiniteNumber(left);
  const rightNumber = asFiniteNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber === rightNumber;
  }

  const leftDate = asDate(left);
  const rightDate = asDate(right);
  if (leftDate && rightDate) {
    return leftDate.getTime() === rightDate.getTime();
  }

  return false;
}

function compareValues(
  left: unknown,
  right: unknown,
): { greater: boolean; smaller: boolean } | null {
  const leftNumber = asFiniteNumber(left);
  const rightNumber = asFiniteNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return {
      greater: leftNumber > rightNumber,
      smaller: leftNumber < rightNumber,
    };
  }

  const leftDate = asDate(left);
  const rightDate = asDate(right);
  if (leftDate && rightDate) {
    return {
      greater: leftDate.getTime() > rightDate.getTime(),
      smaller: leftDate.getTime() < rightDate.getTime(),
    };
  }

  return null;
}

function evaluateComparison(
  entry: unknown,
  operator: WhereOperator,
  comparison: WhereComparison,
): boolean {
  const resolved = readPath(entry, comparison.path);

  let result: boolean;
  switch (operator) {
    case "has":
      result = resolved !== undefined && resolved !== null;
      break;
    case "eq":
      result = valuesEqual(resolved, comparison.value);
      break;
    case "lgt": {
      const compared = compareValues(resolved, comparison.value);
      result = compared?.greater ?? false;
      break;
    }
    case "smt": {
      const compared = compareValues(resolved, comparison.value);
      result = compared?.smaller ?? false;
      break;
    }
  }

  return comparison.negate ? !result : result;
}

export function evaluateExpression(
  entry: unknown,
  expression: WhereExpression,
): boolean {
  if ("all" in expression) {
    return expression.all.every((child) =>
      evaluateExpression(entry, child),
    );
  }

  if ("any" in expression) {
    return expression.any.some((child) =>
      evaluateExpression(entry, child),
    );
  }

  if ("not" in expression) {
    return !evaluateExpression(entry, expression.not);
  }

  if ("eq" in expression) {
    return evaluateComparison(entry, "eq", expression.eq);
  }
  if ("has" in expression) {
    return evaluateComparison(entry, "has", expression.has);
  }
  if ("lgt" in expression) {
    return evaluateComparison(entry, "lgt", expression.lgt);
  }
  if ("smt" in expression) {
    return evaluateComparison(entry, "smt", expression.smt);
  }

  throw new ToolInputError("invalid where expression");
}

export function evaluateWhere(
  entries: unknown[],
  expression: WhereExpression,
  options: EvaluateWhereOptions = {},
): WhereEvaluation {
  const results = entries.map((entry) => ({
    entry,
    matched: evaluateExpression(entry, expression),
  }));

  const matchedCount = results.filter((result) => result.matched).length;
  const quantifier = options.quantifier ?? "some";
  const matched =
    quantifier === "every"
      ? results.every((result) => result.matched)
      : results.some((result) => result.matched);

  return {
    matched,
    results,
    evaluated: entries.length,
    matchedCount,
  };
}

export function validateWhereExpression(value: unknown): WhereExpression {
  return validateExpression(value, 0);
}

function validateExpression(
  value: unknown,
  depth: number,
): WhereExpression {
  if (depth > MAX_DEPTH) {
    throw new ToolInputError(
      `where expression is too deeply nested (max ${MAX_DEPTH})`,
    );
  }

  if (!isPlainObject(value)) {
    throw new ToolInputError("where expression must be an object");
  }

  const keys = Object.keys(value).filter((key) =>
    (EXPRESSION_KEYS as readonly string[]).includes(key),
  );
  const unknownKeys = Object.keys(value).filter(
    (key) => !(EXPRESSION_KEYS as readonly string[]).includes(key),
  );

  if (unknownKeys.length > 0) {
    throw new ToolInputError(
      `unknown where expression key(s): ${unknownKeys.join(", ")}`,
    );
  }

  if (keys.length !== 1) {
    throw new ToolInputError(
      "where expression must contain exactly one of: eq, has, lgt, smt, all, any, not",
    );
  }

  const key = keys[0];

  if (!key) {
    throw new ToolInputError(
      "where expression must contain exactly one of: eq, has, lgt, smt, all, any, not",
    );
  }

  if (key === "all" || key === "any") {
    const children = value[key];
    if (!Array.isArray(children)) {
      throw new ToolInputError(`"${key}" must be an array`);
    }
    return {
      [key]: children.map((child) => validateExpression(child, depth + 1)),
    } as WhereExpression;
  }

  if (key === "not") {
    return { not: validateExpression(value.not, depth + 1) };
  }

  const comparison = value[key];
  if (!isPlainObject(comparison)) {
    throw new ToolInputError(`"${key}" must be an object`);
  }

  const path = comparison.path;
  if (typeof path !== "string" || !path.trim()) {
    throw new ToolInputError(`"${key}.path" must be a non-empty string`);
  }

  if (
    comparison.negate !== undefined &&
    typeof comparison.negate !== "boolean"
  ) {
    throw new ToolInputError(`"${key}.negate" must be a boolean`);
  }

  if (key !== "has" && comparison.value === undefined) {
    throw new ToolInputError(`"${key}.value" is required`);
  }

  return {
    [key]: {
      path,
      ...(key !== "has" ? { value: comparison.value } : {}),
      ...(comparison.negate !== undefined
        ? { negate: comparison.negate }
        : {}),
    },
  } as WhereExpression;
}
