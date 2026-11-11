import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import { mergeToolInput, readString } from "../../utils";
import { validateWhereExpression } from "../../conditions/where";
import { selectToolState } from "../toolState/services/selectToolState";

function readSelect(value: unknown): "all" | "first" {
  if (value === undefined || value === null) return "all";
  if (value !== "all" && value !== "first") {
    throw new ToolInputError('"select" must be "all" or "first"');
  }
  return value;
}

const definition: ToolDefinition = {
  key: "display_block",
  name: "Display block",
  description:
    'Display a matching piece of toolState using the UI block registry. Without `path`, entries are selected directly; with `path`, matching items inside an array or a single object/scalar value are selected. Use `block` to force a block id, or omit it to let the frontend match by output shape. Use `select: "first"` to display one thing. This tool never changes toolState.',
  category: "ui",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Optional path on each entry, for example `todos`, `todo`, `todo.name`, or `result.todos`. Arrays select their items; objects and scalars are selected as a single value.",
      },
      where: {
        type: "object",
        description:
          "Same recursive expression as the if tool. Without `path`, paths resolve against each entry. With `path`, paths resolve against each item in that array, for example `done`. Comparisons: { eq|has|lgt|smt: { path, value?, negate? } }. Groups: { all: [...] }, { any: [...] }, { not: {...} }.",
      },
      block: {
        type: "string",
        description:
          "Optional block id to force, for example `todo`. Omit to let the frontend choose a block by output shape.",
      },
      select: {
        type: "string",
        description:
          "all returns every selected item; first returns only the first match.",
        enum: ["all", "first"],
        default: "all",
      },
    },
  },
  outputDescription:
    "The selected tool-state entries, array items, or single values wrapped as `{ block, items, count, path }` for the block registry.",
  exampleConfig: {
    path: "todos",
    where: { eq: { path: "done", value: false } },
    block: "todo",
    select: "all",
  },
};

export const displayBlockTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const itemPath = readString(input, "path");
    const block = readString(input, "block");
    const select = readSelect(input.select);

    if (itemPath !== undefined && !itemPath.trim()) {
      throw new ToolInputError('"path" must be a non-empty string');
    }

    if (block !== undefined && !block.trim()) {
      throw new ToolInputError('"block" must be a non-empty string');
    }

    const where =
      input.where === undefined
        ? undefined
        : validateWhereExpression(input.where);

    const selection = selectToolState(context.toolState, {
      path: itemPath,
      where,
      mode: "whitelist",
      allowScalar: true,
    });

    const items =
      select === "first" ? selection.items.slice(0, 1) : selection.items;

    return {
      output: {
        block: block ?? null,
        items,
        count: items.length,
        path: itemPath ?? null,
      },
      summary:
        items.length === 0
          ? "No matching tool-state entries to display"
          : `Displayed ${items.length} tool-state ${
              selection.scope === "items" ? "item" : "entry"
            }${items.length === 1 ? "" : "s"}`,
      appendOutput: false,
    };
  },
};
