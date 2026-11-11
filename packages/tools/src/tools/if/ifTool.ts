import { mergeToolInput, readPath, readString } from "../../utils";
import { evaluateWhere, validateWhereExpression } from "../../conditions/where";
import { ToolInputError, type Tool, type ToolDefinition } from "../../model";

const definition: ToolDefinition = {
  key: "if",
  name: "If",
  description:
    'Evaluate a recursive condition against toolState and continue on the true or false branch. By default `where` is evaluated per tool-state entry. Set `path` to an array on each entry to evaluate its items instead, for example `{ path: "todos", where: { eq: { path: "done", value: true } }, quantifier: "some" }` matches when any todo from find_todos is done.',
  category: "ai",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Optional path to an array on each entry, for example `todos`. When set, `where` is evaluated against each array item and `quantifier` applies across all collected items.",
      },
      where: {
        type: "object",
        description:
          "Recursive condition tree. Without `path`, paths resolve against each tool-state entry, for example `todo.done` or `todos.0.done`. With `path`, paths resolve against each item in that array, for example `done`. Comparisons: { eq|has|lgt|smt: { path, value?, negate? } }. Groups: { all: [...] } (AND), { any: [...] } (OR), { not: {...} } (NOT). Groups may nest.",
      },
      quantifier: {
        type: "string",
        description:
          "some = at least one entry/item matches; every = all entries/items match.",
        enum: ["some", "every"],
        default: "some",
      },
    },
    required: ["where"],
  },
  outputDescription:
    "Whether the condition matched, how many entries/items were evaluated, and which branch was chosen.",
  outputTypes: ["normal"],
  exampleConfig: {
    path: "todos",
    where: {
      eq: { path: "done", value: true },
    },
    quantifier: "some",
  },
};

export const ifTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const quantifierInput = readString(input, "quantifier") ?? "some";
    const itemPath = readString(input, "path");

    if (quantifierInput !== "some" && quantifierInput !== "every") {
      throw new ToolInputError('"quantifier" must be "some" or "every"');
    }

    if (itemPath !== undefined && !itemPath.trim()) {
      throw new ToolInputError('"path" must be a non-empty string');
    }

    if (input.where === undefined) {
      throw new ToolInputError("if tool requires a `where` expression");
    }

    const expression = validateWhereExpression(input.where);
    const entries =
      itemPath === undefined
        ? context.toolState
        : context.toolState.flatMap((entry) => {
            const items = readPath(entry, itemPath);
            return Array.isArray(items) ? items : [];
          });

    const result = evaluateWhere(entries, expression, {
      quantifier: quantifierInput,
    });

    return {
      output: {
        matched: result.matched,
        quantifier: quantifierInput,
        evaluated: result.evaluated,
        matchedCount: result.matchedCount,
        path: itemPath ?? null,
        where: expression,
      },
      summary: `If condition ${result.matched ? "matched" : "did not match"} (${result.matchedCount}/${result.evaluated} ${itemPath === undefined ? "entries" : `items at "${itemPath}"`})`,
      branch: result.matched ? "true" : "false",
      appendOutput: false,
    };
  },
};
