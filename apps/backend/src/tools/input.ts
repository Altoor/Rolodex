import type { ToolRunContext, ToolStateEntry } from "./types";
import { ToolInputError } from "./types";

export const TOOL_OUTPUT_START = "<<<TOOL_OUTPUT>>>";
export const TOOL_OUTPUT_END = "<<<END_TOOL_OUTPUT>>>";

/**
 * Parses `value` as a JSON object. Invalid JSON, arrays, primitives and empty
 * strings all return null. This helper never throws.
 */
export function parseJsonObject(value: string): Record<string, unknown> | null {
  if (!value.trim()) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Appends structured tool output to a state string without replacing any
 * free-form text the state may already contain.
 */
export function serializeToolOutput(value: Record<string, unknown>): string {
  return `\n${TOOL_OUTPUT_START}\n${JSON.stringify(value)}\n${TOOL_OUTPUT_END}\n`;
}

/**
 * Reads the last structured tool-output block in `state`. Missing or invalid
 * blocks return null. This helper never throws.
 */
export function extractToolOutput(
  state: string,
): Record<string, unknown> | null {
  const end = state.lastIndexOf(TOOL_OUTPUT_END);
  if (end === -1) return null;

  const start = state.lastIndexOf(TOOL_OUTPUT_START, end);
  if (start === -1) return null;

  const contents = state.slice(start + TOOL_OUTPUT_START.length, end);
  return parseJsonObject(contents);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Serializes accumulated tool state for prompts or for the append_state /
 * set_state tools. Entries are serialized as-is.
 */
export function serializeToolState(
  toolState: ToolStateEntry[],
  format: "json" | "text" = "json",
): string {
  if (format === "text") {
    return toolState
      .map((entry) =>
        typeof entry === "string" ? entry : JSON.stringify(entry, null, 2),
      )
      .join("\n\n");
  }

  return JSON.stringify(toolState, null, 2);
}

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

export function requireNonEmptyString(
  value: string | null | undefined,
  fieldName: string,
): string {
  if (value === undefined || value === null || !value.trim()) {
    throw new ToolInputError(`${fieldName} is required`);
  }
  return value;
}
