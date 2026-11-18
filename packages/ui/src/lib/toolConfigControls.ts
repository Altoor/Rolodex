import type {
  ToolInputProperty,
  ToolInputSchema,
} from "#components/tools/toolDetails";

export type ToolConfigControlKind =
  "boolean" | "enum" | "number" | "path" | "model";

export interface ToolConfigControl {
  key: string;
  property: ToolInputProperty;
  kind: ToolConfigControlKind;
}

const PATH_KEYS = new Set(["path", "parentPath"]);
const MODEL_KEYS = new Set(["model", "decisionModel"]);
/** Ids should normally come from toolState, so they stay JSON-only. */
const ID_KEY_PATTERN = /(^id$|[a-z]Id$)/;

/**
 * Picks the schema properties that get a structured control above the JSON
 * editor. Objects and free-form strings stay JSON-only until they earn a
 * dedicated editor.
 */
export function toolConfigControls(
  schema: unknown,
  excluded: readonly string[] = [],
): ToolConfigControl[] {
  const skip = new Set(excluded);
  const properties =
    (schema as ToolInputSchema | null | undefined)?.properties ?? {};

  return Object.entries(properties).flatMap(([key, property]) => {
    if (skip.has(key)) return [];
    const kind = controlKind(key, property);
    return kind ? [{ key, property, kind }] : [];
  });
}

function controlKind(
  key: string,
  property: ToolInputProperty,
): ToolConfigControlKind | null {
  if (property.type === "boolean") return "boolean";
  if ((property.enum?.length ?? 0) > 0) return "enum";
  if (property.type === "string" && PATH_KEYS.has(key)) return "path";
  if (property.type === "string" && MODEL_KEYS.has(key)) return "model";
  if (property.type === "number" && !ID_KEY_PATTERN.test(key)) return "number";
  return null;
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

export function hasConfigKey(
  config: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(config, key);
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

export function stringConfigValue(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function numberConfigValue(
  config: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
