import { mergeToolInput, readBoolean, readString, serializeToolState } from "../../utils";
import type { Tool, ToolDefinition } from "../../model";

const definition: ToolDefinition = {
  key: "append_state",
  name: "Append state",
  description:
    "Append the accumulated toolState to the original state. This is one of the few tools that permanently changes state.",
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
        description: "Clear toolState after appending it to state.",
        default: true,
      },
    },
  },
  outputDescription: "The serialized tool state and entry count.",
  exampleConfig: { format: "json", clearToolState: true },
};

export const appendStateTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const formatInput = readString(input, "format") ?? "json";
    const format = formatInput === "text" ? "text" : "json";
    const clearToolState = readBoolean(input, "clearToolState") ?? true;
    const serialized = serializeToolState(context.toolState, format);
    const separator = context.state.trim() ? "\n\n" : "";

    return {
      output: { appended: serialized, entries: context.toolState.length },
      summary: `Appended ${context.toolState.length} tool-state entries to state`,
      nextState: `${context.state}${separator}${serialized}`,
      clearToolState,
      appendOutput: false,
    };
  },
};
