import { assertPulledModel } from "../../ai/model";
import { mergeToolInput, readString, requireNonEmptyString } from "./../input";
import type { Tool, ToolDefinition } from "./../types";

const definition: ToolDefinition = {
  key: "model_selector",
  name: "Model selector",
  description: "Choose the model that the next tool or decision should use.",
  category: "ai",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      model: {
        type: "string",
        description: "An installed/pulled Ollama model name.",
      },
    },
    required: ["model"],
  },
  outputDescription: "The model that the next step will use.",
  exampleConfig: { model: "gemma4:e2b" },
};

export const modelSelectorTool: Tool = {
  definition,

  async execute(context) {
    const model = requireNonEmptyString(
      readString(mergeToolInput(context), "model"),
      "model",
    );

    await assertPulledModel(model);

    return {
      output: { model },
      summary: `Next step will use model "${model}"`,
      nextModel: model,
    };
  },
};
