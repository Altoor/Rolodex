import { ToolInputError } from "../model/tool-error";
import type { ToolRunContext } from "../model/tool-context";
import { isPlainObject, parseJsonObject } from "./json";
import { extractToolOutput } from "./tool-output";

/**
 * Combines tool config, JSON state, legacy structured output and accumulated
 * tool state. Later sources override earlier ones.
 */
export function mergeToolInput(
  context: ToolRunContext,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...(context.config ?? {}),
    ...(parseJsonObject(context.state) ?? {}),
    ...(extractToolOutput(context.state) ?? {}),
  };

  for (const entry of context.toolState) {
    if (isPlainObject(entry)) {
      Object.assign(merged, entry);
    }
  }

  return merged;
}

export function readString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ToolInputError(`"${key}" must be a string`);
  }
  return value;
}

export function readNumber(
  input: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ToolInputError(`"${key}" must be a number`);
  }
  return value;
}

export function readBoolean(
  input: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new ToolInputError(`"${key}" must be a boolean`);
  }
  return value;
}

export function readNumberArray(value: unknown, key: string): number[] {
  if (!Array.isArray(value)) {
    throw new ToolInputError(`"${key}" must be an array`);
  }
  return value.map((item) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new ToolInputError(`"${key}" values must be numbers`);
    }
    return item;
  });
}

export function requireNonEmptyString(
  value: string | null | undefined,
  fieldName: string,
): string {
  if (value === undefined || value === null || !value.trim()) {
    throw new ToolInputError(`${fieldName} is required`);
  }
  return value;
}
