import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import { mergeToolInput, readBoolean, readString } from "../../utils";
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
  key: "end_flow",
  name: "End flow",
  description:
    "End the run and publish a chosen part of its accumulated tool state as the result. Without `path`, entries are selected directly; with `path`, matching items inside an array or a single value are selected. Set `includeState` or `includeToolState` to expose the full flow data too. This tool never changes state or toolState.",
  category: "ui",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Optional human-readable result message.",
      },
      path: {
        type: "string",
        description:
          "Optional path on each entry, for example `todos`, `todo`, or `result.todos`. Arrays select their items; objects and scalars are selected as a single value.",
      },
      where: {
        type: "object",
        description:
          "Same recursive expression as the if tool. Without `path`, paths resolve against each entry. With `path`, paths resolve against each item in that array, for example `done`.",
      },
      block: {
        type: "string",
        description:
          "Optional block id to force in the landing view, for example `todo`. Omit to let the frontend match by output shape.",
      },
      select: {
        type: "string",
        description:
          "all returns every selected item; first returns only the first match.",
        enum: ["all", "first"],
        default: "all",
      },
      includeState: {
        type: "boolean",
        description: "Include the run's current state string in the result.",
        default: false,
      },
      includeToolState: {
        type: "boolean",
        description: "Include the full accumulated tool state in the result.",
        default: false,
      },
    },
  },
  outputDescription:
    "`{ done: true, message, block, items, count, path }`, plus `state` and `toolState` when requested. Selected items are rendered as a UI block.",
  exampleConfig: {
    message: "Flow finished",
    path: "todos",
    where: { eq: { path: "done", value: true } },
    block: "todo",
    select: "all",
    includeState: false,
    includeToolState: false,
  },
  outputTypes: ["normal"],
  trialSafe: true,
};

export const endFlowTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const itemPath = readString(input, "path");
    const block = readString(input, "block");
    const message = readString(input, "message");
    const select = readSelect(input.select);
    const includeState = readBoolean(input, "includeState") ?? false;
    const includeToolState =
      readBoolean(input, "includeToolState") ?? false;

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
        done: true,
        message: message ?? null,
        block: block ?? null,
        items,
        count: items.length,
        path: itemPath ?? null,
        ...(includeState ? { state: context.state } : {}),
        ...(includeToolState ? { toolState: context.toolState } : {}),
      },
      summary:
        message ??
        `Flow ended with ${items.length} selected ${
          selection.scope === "items" ? "item" : "entry"
        }${items.length === 1 ? "" : "s"}`,
      appendOutput: false,
      endFlow: true,
    };
  },
};
