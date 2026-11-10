import { parseJsonObject } from "./json";

export const TOOL_OUTPUT_START = "<<<TOOL_OUTPUT>>>";
export const TOOL_OUTPUT_END = "<<<END_TOOL_OUTPUT>>>";

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
