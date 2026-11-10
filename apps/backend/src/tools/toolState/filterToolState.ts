import { ToolInputError, type Tool, type ToolDefinition } from "../types";
import { mergeToolInput, readString } from "../input";
import {
  evaluateExpression,
  validateWhereExpression,
} from "../conditions/where";

function readMode(value: unknown): "whitelist" | "blacklist" {
  if (value === undefined || value === null) return "blacklist";
  if (value !== "whitelist" && value !== "blacklist") {
    throw new ToolInputError('"mode" must be "whitelist" or "blacklist"');
  }
  return value;
}

function readNumberArray(value: unknown, key: string): number[] {
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

const definition: ToolDefinition = {
  key: "filter_tool_state",
  name: "Filter tool state",
  description:
    "Keep or remove tool-state entries using the same recursive condition language as the if tool.",
  category: "ai",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description:
          "Whitelist keeps matching entries; blacklist removes matching entries.",
        enum: ["whitelist", "blacklist"],
        default: "blacklist",
      },
      where: {
        type: "object",
        description:
          "Same recursive expression as the if tool, evaluated once per entry. Paths resolve against the entry itself, for example `todo.done` or `todos.0.done`. Comparisons are { eq|has|lgt|smt: { path, value?, negate? } }; groups are { all: [...] }, { any: [...] }, or { not: {...} }.",
      },
      field: {
        type: "string",
        description:
          "Optional simple selector used when `where` is omitted.",
        enum: ["index"],
      },
      values: {
        type: "array",
        description: "Entry indices for the simple selector.",
        items: { type: "number", description: "A tool-state index." },
      },
    },
  },
  outputDescription:
    "The kept tool-state entries, plus kept/removed counts.",
  exampleConfig: {
    mode: "whitelist",
    where: {
      eq: { path: "todo.done", value: true },
    },
  },
};

export const filterToolStateTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const mode = readMode(input.mode);
    const value = input.where;

    let filtered: unknown[];

    if (value !== undefined) {
      const expression = validateWhereExpression(value);

      filtered = context.toolState.filter((entry) => {
        const matched = evaluateExpression(entry, expression);
        return mode === "whitelist" ? matched : !matched;
      });
    } else {
      const fieldInput = readString(input, "field") ?? "index";
      if (fieldInput !== "index") {
        throw new ToolInputError('"field" must be "index"');
      }

      if (input.values === undefined) {
        throw new ToolInputError(
          "filter_tool_state requires either `where` or `values`",
        );
      }

      const values = readNumberArray(input.values, "values");
      if (values.length === 0) {
        throw new ToolInputError('"values" must not be empty');
      }

      filtered = context.toolState.filter((_entry, index) => {
        const matched = values.includes(index);
        return mode === "whitelist" ? matched : !matched;
      });
    }

    const kept = filtered.length;
    const removed = context.toolState.length - kept;

    return {
      output: { kept, removed, toolState: filtered },
      summary: `Kept ${kept} of ${context.toolState.length} tool-state entries`,
      toolState: filtered,
      appendState: false,
    };
  },
};
