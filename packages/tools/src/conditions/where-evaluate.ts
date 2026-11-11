import { ToolInputError } from "../model/tool-error";
import { readPath } from "../utils/paths";
import { compareValues, valuesEqual } from "../utils/values";
import type {
  EvaluateWhereOptions,
  WhereComparison,
  WhereEvaluation,
  WhereExpression,
  WhereOperator,
} from "./where-types";

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
