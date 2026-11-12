import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import { mergeToolInput, readNumberArray, readString } from "../../utils";
import { validateWhereExpression } from "../../conditions/where";
import { selectToolState } from "./services/selectToolState";

function readMode(value: unknown): "whitelist" | "blacklist" {
  if (value === undefined || value === null) return "blacklist";
  if (value !== "whitelist" && value !== "blacklist") {
    throw new ToolInputError('"mode" must be "whitelist" or "blacklist"');
  }
  return value;
}

const definition: ToolDefinition = {
  key: "filter_tool_state",
  name: "Filter tool state",
  description:
    'Keep or remove tool-state entries using the same recursive condition language as the if tool. Without `path`, `where` is evaluated once per entry, for example `{ eq: { path: "todo.done", value: true } }`. With `path`, it is evaluated once per item in that array instead, so `{ path: "todos", mode: "whitelist", where: { eq: { path: "done", value: true } } }` keeps only the done todos from `find_todos` output.',
  category: "ai",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description:
          "Whitelist keeps matching entries/items; blacklist removes matching entries/items.",
        enum: ["whitelist", "blacklist"],
        default: "blacklist",
      },
      path: {
        type: "string",
        description:
          "Optional path to an array on each entry, for example `todos`. When set, `where` and `mode` act on the items in that array and entries whose array becomes empty are dropped.",
      },
      where: {
        type: "object",
        description:
          "Same recursive expression as the if tool. Without `path`, paths resolve against each entry, for example `todo.done` or `todos.0.done`. With `path`, paths resolve against each item in that array, for example `done`. Comparisons are { eq|has|lgt|smt: { path, value?, negate? } }; groups are { all: [...] }, { any: [...] }, or { not: {...} }.",
      },
      field: {
        type: "string",
        description: "Optional simple selector used when `where` is omitted.",
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
    "The kept tool-state entries (or array items when `path` is set), plus kept/removed counts.",
  exampleConfig: {
    mode: "whitelist",
    path: "todos",
    where: {
      eq: { path: "done", value: true },
    },
  },
};

export const filterToolStateTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const mode = readMode(input.mode);
    const value = input.where;
    const itemPath = readString(input, "path");

    if (itemPath !== undefined) {
      if (!itemPath.trim()) {
        throw new ToolInputError('"path" must be a non-empty string');
      }

      if (value === undefined) {
        throw new ToolInputError(
          "filter_tool_state requires `where` when `path` is set",
        );
      }

      const expression = validateWhereExpression(value);
      const selection = selectToolState(context.toolState, {
        path: itemPath,
        where: expression,
        mode,
      });

      return {
        output: {
          kept: selection.kept,
          removed: selection.removed,
          scope: selection.scope,
          toolState: selection.entries,
        },
        summary: `Kept ${selection.kept} of ${
          selection.kept + selection.removed
        } items at "${itemPath}"`,
        toolState: selection.entries,
        appendOutput: false,
      };
    }

    let filtered: unknown[];

    if (value !== undefined) {
      const expression = validateWhereExpression(value);
      filtered = selectToolState(context.toolState, {
        where: expression,
        mode,
      }).entries;
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
      output: { kept, removed, scope: "entries", toolState: filtered },
      summary: `Kept ${kept} of ${context.toolState.length} tool-state entries`,
      toolState: filtered,
      appendOutput: false,
    };
  },
};
