/**
 * Resolves a dotted/bracket path against an arbitrary value. Supports paths
 * such as `data.todos.0.done` and `output.todos[0].name`.
 */
export function readPath(source: unknown, path: string): unknown {
  const segments = pathSegments(path);

  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Returns a copy of `source` with the value at `path` replaced. Only the
 * objects/arrays along the path are copied; everything else is shared.
 */
export function replacePath(
  source: unknown,
  path: string,
  value: unknown,
): unknown {
  return replaceAtPath(source, pathSegments(path), value);
}

function pathSegments(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((segment) => segment.length > 0);
}

function replaceAtPath(
  source: unknown,
  segments: string[],
  value: unknown,
): unknown {
  const [segment, ...rest] = segments;
  if (segment === undefined) return value;

  if (Array.isArray(source)) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0 || index >= source.length) {
      return source;
    }

    const copy = [...source];
    copy[index] =
      rest.length === 0 ? value : replaceAtPath(source[index], rest, value);
    return copy;
  }

  if (source !== null && typeof source === "object") {
    const record = source as Record<string, unknown>;
    return {
      ...record,
      [segment]:
        rest.length === 0 ? value : replaceAtPath(record[segment], rest, value),
    };
  }

  return source;
}
