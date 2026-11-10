import { ToolInputError } from "../model/tool-error";
import { isPlainObject } from "../utils/json";
import {
  EXPRESSION_KEYS,
  MAX_DEPTH,
  type WhereExpression,
} from "./where-types";

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
