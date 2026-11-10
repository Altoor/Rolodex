import { mergeToolInput, readString } from "../input";
import {
  evaluateWhere,
  validateWhereExpression,
} from "../conditions/where";
import { ToolInputError, type Tool, type ToolDefinition } from "../types";

const definition: ToolDefinition = {
  key: "if",
  name: "If",
  description:
    "Evaluate a recursive condition against toolState and continue on the true or false branch.",
  category: "ai",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      where: {
        type: "object",
        description:
          "Recursive condition tree evaluated against each tool-state entry. Paths resolve against the entry itself, for example `todo.done` or `todos.0.done`. Comparisons: { eq|has|lgt|smt: { path, value?, negate? } }. Groups: { all: [...] } (AND), { any: [...] } (OR), { not: {...} } (NOT). Groups may nest.",
      },
      quantifier: {
        type: "string",
        description:
          "some = at least one entry matches; every = all entries match.",
        enum: ["some", "every"],
        default: "some",
      },
    },
    required: ["where"],
  },
  outputDescription:
    "Whether the condition matched, how many entries were evaluated, and which branch was chosen.",
  outputTypes: ["normal"],
  exampleConfig: {
    where: {
      eq: { path: "todo.done", value: true },
    },
    quantifier: "some",
  },
};

export const ifTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const quantifierInput = readString(input, "quantifier") ?? "some";

    if (quantifierInput !== "some" && quantifierInput !== "every") {
      throw new ToolInputError('"quantifier" must be "some" or "every"');
    }

    if (input.where === undefined) {
      throw new ToolInputError("if tool requires a `where` expression");
    }

    const expression = validateWhereExpression(input.where);
    const result = evaluateWhere(context.toolState, expression, {
      quantifier: quantifierInput,
    });

    return {
      output: {
        matched: result.matched,
        quantifier: quantifierInput,
        evaluated: result.evaluated,
        matchedCount: result.matchedCount,
        where: expression,
      },
      summary: `If condition ${result.matched ? "matched" : "did not match"} (${result.matchedCount}/${result.evaluated} entries)`,
      branch: result.matched ? "true" : "false",
      appendState: false,
    };
  },
};
