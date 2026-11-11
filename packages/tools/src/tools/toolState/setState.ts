import { mergeToolInput, readBoolean, readString, serializeToolState } from "../../utils";
import type { Tool, ToolDefinition } from "../../model";

const definition: ToolDefinition = {
  key: "set_state",
  name: "Set state",
  description:
    "Replace the original state with the accumulated toolState. This is one of the few tools that permanently changes state.",
  category: "ai",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        description: "How to serialize the tool state.",
        enum: ["json", "text"],
        default: "json",
      },
      clearToolState: {
        type: "boolean",
        description: "Clear toolState after replacing state.",
        default: true,
      },
    },
  },
  outputDescription: "The serialized tool state and entry count.",
  exampleConfig: { format: "json", clearToolState: true },
};

export const setStateTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const formatInput = readString(input, "format") ?? "json";
    const format = formatInput === "text" ? "text" : "json";
    const clearToolState = readBoolean(input, "clearToolState") ?? true;
    const serialized = serializeToolState(context.toolState, format);

    return {
      output: { state: serialized, entries: context.toolState.length },
      summary: `Replaced state with ${context.toolState.length} tool-state entries`,
      nextState: serialized,
      clearToolState,
      appendOutput: false,
    };
  },
};
