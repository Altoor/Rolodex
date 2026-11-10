import { getModelForUser, ollama } from "@repo/ai";
import {
  mergeToolInput,
  readBoolean,
  readString,
  serializeToolState,
} from "../../utils";
import {
  ToolInputError,
  type Tool,
  type ToolDefinition,
  type ToolExecution,
} from "../../model";

export interface PromptOptions {
  prompt: string;
  system?: string;
  model: string;
  format?: Record<string, unknown>;
}

export interface PromptResult {
  text: string;
  thinking?: string;
  model: string;
}

export async function runPrompt(options: PromptOptions): Promise<PromptResult> {
  const response = await ollama.generate({
    model: options.model,
    prompt: options.prompt,
    system: options.system,
    format: options.format,
  });

  const text = response.response;
  if (!text || !text.trim()) {
    throw new Error(`Model "${options.model}" returned an empty response`);
  }

  return {
    text,
    thinking: response.thinking,
    model: options.model,
  };
}

function readFormat(
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const value = input.format;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ToolInputError(`"format" must be an object`);
  }
  return value as Record<string, unknown>;
}

const definition: ToolDefinition = {
  key: "prompt",
  name: "Prompt",
  description:
    "Send a prompt to an installed Ollama model, wait for the answer, and return it.",
  category: "ai",
  inputMode: "text",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The prompt to send. Defaults to the queued task's state.",
      },
      system: {
        type: "string",
        description: "Optional system prompt.",
      },
      model: {
        type: "string",
        description:
          "Optional generation model override. Defaults to the model inherited by the run context, then the user's default generation model.",
      },
      format: {
        type: "object",
        description:
          "Optional JSON schema passed to Ollama for structured output.",
      },
      useToolState: {
        type: "boolean",
        description:
          "Append the accumulated toolState to the prompt. Defaults to false.",
        default: false,
      },
    },
  },
  outputDescription:
    "The model answer as text, plus the model name and optional thinking text.",
  exampleConfig: {
    model: "gemma4:e2b",
    system: "You are a helpful assistant.",
    useToolState: true,
  },
};

export const promptTool: Tool = {
  definition,

  async execute(context): Promise<ToolExecution> {
    const input = mergeToolInput(context);
    const useToolState = readBoolean(input, "useToolState") ?? false;
    const basePrompt = readString(input, "prompt") ?? context.state;

    if (!basePrompt || !basePrompt.trim()) {
      throw new ToolInputError("prompt is required");
    }

    const prompt = useToolState
      ? `${basePrompt}\n\nTool state:\n${serializeToolState(context.toolState)}`
      : basePrompt;

    const model =
      readString(input, "model") ??
      context.model ??
      (await getModelForUser(context.userId));

    if (!model.trim()) {
      throw new ToolInputError("prompt tool requires a model");
    }

    const system = readString(input, "system");
    const format = readFormat(input);

    const result = await runPrompt({ prompt, system, model, format });

    return {
      output: {
        text: result.text,
        thinking: result.thinking,
        model: result.model,
      },
      summary: result.text,
      toolStateAppend: { text: result.text },
      // Prompt answers are normally useful to the next task.
    };
  },
};
