import { ollama } from "../../ai/Ollama";
import { mergeToolInput, readString } from "../input";
import {
  ToolInputError,
  type Tool,
  type ToolDefinition,
  type ToolExecution,
} from "../types";

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
          "Optional model override. Takes precedence over the model inherited by the run context.",
      },
      format: {
        type: "object",
        description:
          "Optional JSON schema passed to Ollama for structured output.",
      },
    },
  },
  outputDescription:
    "The model answer as text, plus the model name and optional thinking text.",
  exampleConfig: {
    model: "gemma4:e2b",
    system: "You are a helpful assistant.",
    appendState: true,
  },
};

export const promptTool: Tool = {
  definition,

  async execute(context): Promise<ToolExecution> {
    const input = mergeToolInput(context);
    const prompt = readString(input, "prompt") ?? context.state;

    if (!prompt || !prompt.trim()) {
      throw new ToolInputError("prompt is required");
    }

    const model = readString(input, "model") ?? context.model;
    if (!model || !model.trim()) {
      throw new ToolInputError(
        "prompt tool requires a model; select one on the task or run the model_selector tool first",
      );
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
      stateAppend: result.text,
      // Prompt answers are normally useful to the next task.
      appendState: true,
    };
  },
};
