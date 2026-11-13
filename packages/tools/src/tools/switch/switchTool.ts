import {
  evaluateWhere,
  validateWhereExpression,
  type WhereExpression,
} from "../../conditions/where";
import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import { isPlainObject, readPath } from "../../utils";

export interface SwitchCaseConfig {
  id: string;
  label: string;
  when: WhereExpression;
  nextTaskId: number | null;
}

export interface SwitchConfig {
  path: string | null;
  quantifier: "some" | "every";
  cases: SwitchCaseConfig[];
  defaultTaskId: number | null;
}

export interface SwitchValidationOptions {
  /** Optional array that receives non-fatal warnings. */
  warnings?: string[];
}

function readPositiveTaskId(
  value: unknown,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ToolInputError(`"${field}" must be a positive integer task id`);
  }

  return value;
}

function isUnconditional(expression: WhereExpression): boolean {
  return "all" in expression && expression.all.length === 0;
}

/**
 * Validates a `switch` toolConfig. Shared by the tool runtime and the GraphQL
 * task service so bad configs are rejected with a ToolInputError.
 */
export function validateSwitchConfig(
  value: unknown,
  options: SwitchValidationOptions = {},
): SwitchConfig {
  if (!isPlainObject(value)) {
    throw new ToolInputError("switch config must be an object");
  }

  const itemPath = value.path;
  if (itemPath !== undefined && itemPath !== null) {
    if (typeof itemPath !== "string" || !itemPath.trim()) {
      throw new ToolInputError('switch "path" must be a non-empty string');
    }
  }

  const quantifierInput = value.quantifier ?? "some";
  if (quantifierInput !== "some" && quantifierInput !== "every") {
    throw new ToolInputError('switch "quantifier" must be "some" or "every"');
  }

  const rawCases = value.cases;
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    throw new ToolInputError("switch requires at least one case");
  }

  const ids = new Set<string>();
  const labels = new Set<string>();
  const cases: SwitchCaseConfig[] = [];

  rawCases.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new ToolInputError(`switch case ${index + 1} must be an object`);
    }

    const id =
      typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) {
      throw new ToolInputError(`switch case ${index + 1} requires an "id"`);
    }
    if (ids.has(id)) {
      throw new ToolInputError(`switch case id "${id}" is duplicated`);
    }
    ids.add(id);

    const label =
      typeof entry.label === "string" ? entry.label.trim() : "";
    if (!label) {
      throw new ToolInputError(`switch case "${id}" requires a "label"`);
    }
    if (labels.has(label)) {
      throw new ToolInputError(`switch case label "${label}" is duplicated`);
    }
    labels.add(label);

    const when =
      entry.when === undefined
        ? ({ all: [] } as WhereExpression)
        : validateWhereExpression(entry.when);

    if (isUnconditional(when) && index < rawCases.length - 1) {
      options.warnings?.push(
        `Switch case "${label}" has an empty condition and will match before later cases.`,
      );
    }

    cases.push({
      id,
      label,
      when,
      nextTaskId: readPositiveTaskId(
        entry.nextTaskId,
        `cases[${index}].nextTaskId`,
      ),
    });
  });

  return {
    path: typeof itemPath === "string" ? itemPath.trim() : null,
    quantifier: quantifierInput,
    cases,
    defaultTaskId: readPositiveTaskId(
      value.defaultTaskId,
      "defaultTaskId",
    ),
  };
}

const definition: ToolDefinition = {
  key: "switch",
  name: "Switch",
  description:
    'Evaluate ordered cases against toolState and continue to the first matching case\'s task, or the default task. Like a switch statement: deterministic conditions instead of the decision model. Config: { path?, quantifier?, cases: [{ id, label, when, nextTaskId }], defaultTaskId? }. Without `path`, `when` is evaluated per tool-state entry; with `path`, it is evaluated against each item in that array.',
  category: "ai",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Optional path to an array on each entry, for example `todos`. When set, each case's `when` is evaluated against the array items and `quantifier` applies across all collected items.",
      },
      quantifier: {
        type: "string",
        description:
          "some = at least one entry/item matches; every = all entries/items match.",
        enum: ["some", "every"],
        default: "some",
      },
      cases: {
        type: "array",
        description:
          "Ordered cases. Each case has a stable `id`, a unique `label`, a `when` expression using the if-tool condition syntax, and an optional positive `nextTaskId`. The first match wins.",
      },
      defaultTaskId: {
        type: "number",
        description:
          "Optional task to continue to when no case matches. Without it, the run stops.",
      },
    },
    required: ["cases"],
  },
  outputDescription:
    "The matching case (id and label), per-case match counts, and the next task id. `branchLabel` is stored on the task result.",
  outputTypes: ["normal"],
  exampleConfig: {
    path: "todos",
    quantifier: "some",
    cases: [
      {
        id: "has-open",
        label: "has open todos",
        when: { eq: { path: "done", value: false } },
        nextTaskId: 12,
      },
      {
        id: "has-todos",
        label: "has todos",
        when: { has: { path: "id" } },
        nextTaskId: 13,
      },
    ],
    defaultTaskId: 14,
  },
};

export const switchTool: Tool = {
  definition,

  async execute(context) {
    // Switch config is authoritative, so ignore toolState keys that happen to
    // share names with config fields.
    const warnings: string[] = [];
    const config = validateSwitchConfig(context.config ?? {}, { warnings });

    const entries =
      config.path === null
        ? context.toolState
        : context.toolState.flatMap((entry) => {
            const items = readPath(entry, config.path!);
            return Array.isArray(items) ? items : [];
          });

    const caseResults = config.cases.map((entry) => {
      const result = evaluateWhere(entries, entry.when, {
        quantifier: config.quantifier,
      });

      return {
        id: entry.id,
        label: entry.label,
        matched: result.matched,
        evaluated: result.evaluated,
        matchedCount: result.matchedCount,
        nextTaskId: entry.nextTaskId,
      };
    });

    const matched = caseResults.find((entry) => entry.matched);
    const defaultTaskId = config.defaultTaskId;
    const nextTaskId = matched?.nextTaskId ?? defaultTaskId ?? null;
    const branchLabel = matched
      ? matched.label
      : defaultTaskId != null
        ? "Default"
        : "No match";

    const summary = matched
      ? nextTaskId != null
        ? `Switch matched "${matched.label}" → task ${nextTaskId}`
        : `Switch matched "${matched.label}" but it has no target task — run stopped`
      : defaultTaskId != null
        ? `Switch matched no case → default task ${defaultTaskId}`
        : "Switch matched no case and no default task — run stopped";

    return {
      output: {
        matchedCaseId: matched?.id ?? null,
        matchedLabel: matched?.label ?? null,
        branchLabel,
        path: config.path,
        quantifier: config.quantifier,
        evaluated: entries.length,
        cases: caseResults,
        defaultTaskId,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      summary,
      nextTaskId,
      branchLabel,
      appendOutput: false,
    };
  },
};
