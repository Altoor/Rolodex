import { assertPulledModel } from "@repo/ai";
import { mergeToolInput, readString, requireNonEmptyString } from "../../utils";
import { ToolInputError, type Tool, type ToolDefinition } from "../../model";

const MODEL_KINDS = ["generation", "decision"] as const;
type ModelKind = (typeof MODEL_KINDS)[number];

const definition: ToolDefinition = {
  key: "model_selector",
  name: "Model selector",
  description:
    "Choose the generation or decision model that the next tool or task should use.",
  category: "ai",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      model: {
        type: "string",
        description: "An installed/pulled Ollama model name.",
      },
      kind: {
        type: "string",
        description:
          'Which model slot to set. Defaults to "generation"; use "decision" for decision tasks and todo selection.',
        enum: [...MODEL_KINDS],
        default: "generation",
      },
    },
    required: ["model"],
  },
  outputDescription: "The model kind and name that the next step will use.",
  exampleConfig: { model: "tev1:4b", kind: "decision" },
};

export const modelSelectorTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const model = requireNonEmptyString(readString(input, "model"), "model");
    const kindInput = readString(input, "kind") ?? "generation";

    if (!MODEL_KINDS.includes(kindInput as ModelKind)) {
      throw new ToolInputError(
        `"kind" must be one of: ${MODEL_KINDS.join(", ")}`,
      );
    }

    const kind = kindInput as ModelKind;

    await assertPulledModel(model);

    if (kind === "decision") {
      return {
        output: { kind, model },
        summary: `Next step will use decision model "${model}"`,
        nextDecisionModel: model,
      };
    }

    return {
      output: { kind, model },
      summary: `Next step will use generation model "${model}"`,
      nextModel: model,
    };
  },
};
