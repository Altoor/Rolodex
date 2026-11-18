import type {
  ToolInputProperty,
  ToolInputSchema,
} from "#components/tools/toolDetails";

export interface ToolConfigControl {
  key: string;
  property: ToolInputProperty;
}

/**
 * Picks the schema properties that get a structured control above the JSON
 * editor. Other types stay JSON-only until they earn a dedicated editor.
 */
export function toolConfigControls(
  schema: unknown,
  excluded: readonly string[] = [],
): ToolConfigControl[] {
  const skip = new Set(excluded);
  const properties =
    (schema as ToolInputSchema | null | undefined)?.properties ?? {};

  return Object.entries(properties)
    .filter(([key, property]) => !skip.has(key) && isControlProperty(property))
    .map(([key, property]) => ({ key, property }));
}

function isControlProperty(property: ToolInputProperty): boolean {
  return property.type === "boolean" || (property.enum?.length ?? 0) > 0;
}

/** Parses the textarea config. Invalid JSON returns null so controls stay hidden. */
export function parseConfigObject(
  text: string | undefined,
): Record<string, unknown> | null {
  if (!text?.trim()) return {};

  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The checked state for a boolean config key, falling back to its default. */
export function booleanConfigValue(
  config: Record<string, unknown>,
  key: string,
  property: ToolInputProperty,
): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : property.default === true;
}

/** The selected enum value, falling back to the schema default. */
export function enumConfigValue(
  config: Record<string, unknown>,
  key: string,
  property: ToolInputProperty,
): string | undefined {
  const value = config[key];
  if (typeof value === "string") return value;
  return typeof property.default === "string" ? property.default : undefined;
}
