import { readString } from "../../../utils";
import { ToolInputError } from "../../../model";
import type { PromptInvalidBehavior } from "./types";

export function readFormat(
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const value = input.format;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ToolInputError(`"format" must be an object`);
  }
  return value as Record<string, unknown>;
}

export function readInvalidBehavior(
  input: Record<string, unknown>,
): PromptInvalidBehavior {
  const value = readString(input, "onInvalid") ?? "fail";

  if (value !== "fail" && value !== "text") {
    throw new ToolInputError(`"onInvalid" must be "fail" or "text"`);
  }

  return value;
}
