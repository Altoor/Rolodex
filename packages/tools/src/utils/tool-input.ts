import { ToolInputError } from "../model/tool-error";
import type { ToolRunContext } from "../model/tool-context";
import { isPlainObject, parseJsonObject } from "./json";
import { containsTemplate, resolveTemplateValues } from "./template";
import { extractToolOutput } from "./tool-output";

/**
 * Runtime values available to a tool: JSON state, legacy structured output and
 * accumulated tool state, with later sources overriding earlier ones.
 */
export function mergeToolRuntime(
  context: ToolRunContext,
): Record<string, unknown> {
  const runtime: Record<string, unknown> = {
    ...(parseJsonObject(context.state) ?? {}),
    ...(extractToolOutput(context.state) ?? {}),
  };

  for (const entry of context.toolState) {
    if (isPlainObject(entry)) {
      Object.assign(runtime, entry);
    }
  }

  return runtime;
}

/**
 * Combines tool config with the runtime values. Later sources override earlier
 * ones. Config values containing `{{path}}` templates are resolved last, so a
 * composed value such as `"{{description}}\n\n{{ocr}}"` wins over the
 * tool-state fields it reads.
 */
export function mergeToolInput(
  context: ToolRunContext,
): Record<string, unknown> {
  const config = context.config ?? {};
  const runtime = mergeToolRuntime(context);
  const merged: Record<string, unknown> = { ...config, ...runtime };

  // Templates may reference config values, but not themselves. When a config
  // template is the effective value for its key, drop it from the source so a
  // missing runtime value fails instead of resolving to the literal template.
  const source = { ...merged };
  for (const [key, value] of Object.entries(config)) {
    if (containsTemplate(value) && source[key] === value) delete source[key];
  }

  const resolvedConfig = Object.entries(config).flatMap(([key, value]) =>
    containsTemplate(value)
      ? [[key, resolveTemplateValues(value, source)] as const]
      : [],
  );

  if (resolvedConfig.length === 0) return merged;

  return { ...merged, ...Object.fromEntries(resolvedConfig) };
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
