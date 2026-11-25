export type DecisionStateMode = "none" | "all" | "paths";

export interface DecisionStateConfig {
  /** Which tool-state values the decision model receives. */
  mode: DecisionStateMode;
  /** Dot paths selected from the flattened tool state. */
  paths: string[];
}

export const DEFAULT_DECISION_STATE_CONFIG: DecisionStateConfig = {
  mode: "none",
  paths: [],
};

/**
 * Parses a stored decision-state config. Returns null for malformed values so
 * callers can reject writes instead of silently changing behavior.
 */
export function parseDecisionStateConfig(
  value: unknown,
): DecisionStateConfig | null {
  if (value === undefined || value === null) {
    return DEFAULT_DECISION_STATE_CONFIG;
  }

  if (typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const mode = record.mode;

  if (mode !== "none" && mode !== "all" && mode !== "paths") return null;

  const rawPaths = record.paths;

  if (
    rawPaths !== undefined &&
    (!Array.isArray(rawPaths) ||
      rawPaths.some((path) => typeof path !== "string"))
  ) {
    return null;
  }

  const paths = (rawPaths as string[] | undefined) ?? [];

  return {
    mode,
    // Keep paths even when another mode is active, so switching modes in the
    // editor does not discard configured selections.
    paths: paths.map((path) => path.trim()).filter(Boolean),
  };
}
