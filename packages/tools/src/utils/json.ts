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

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
