import { getModelForUser } from "@repo/ai";
import {
  mergeToolInput,
  readBoolean,
  readString,
  serializeToolState,
} from "../../../utils";
import { ToolInputError, type Tool, type ToolExecution } from "../../../model";
import { promptDefinition } from "./definition";
import { readFields } from "./fields";
import { readFormat, readInvalidBehavior } from "./input";
import { runPrompt } from "./runPrompt";
import { buildResponseSchema } from "./schema";
import {
  parseStructuredResponse,
  validateParsedFields,
} from "./structuredOutput";

export const promptTool: Tool = {
  definition: promptDefinition,

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
    const fields = readFields(input);
    const onInvalid = readInvalidBehavior(input);

    if (format && fields) {
      throw new ToolInputError(
        '"format" and "fields" cannot be used together; choose one',
      );
    }

    const schema = fields ? buildResponseSchema(fields) : format;
    const result = await runPrompt({ prompt, system, model, format: schema });

    const baseOutput = {
      text: result.text,
      thinking: result.thinking,
      model: result.model,
    };

    if (!fields) {
      return {
        output: baseOutput,
        summary: result.text,
        toolStateAppend: { text: result.text },
        // Prompt answers are normally useful to the next task.
      };
    }

    let parsed: Record<string, unknown>;

    try {
      const response = parseStructuredResponse(result.text);
      if (!response) {
        throw new Error("response was not a JSON object");
      }
      parsed = validateParsedFields(fields, response);
    } catch (err) {
      if (onInvalid === "text") {
        return {
          output: baseOutput,
          summary: result.text,
          toolStateAppend: { text: result.text },
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new ToolInputError(
        `Model returned invalid structured output (${message}). Raw output:\n${result.text}`,
      );
    }

    return {
      output: {
        ...baseOutput,
        ...parsed,
      },
      summary: result.text,
      toolStateAppend: {
        text: result.text,
        ...parsed,
      },
    };
  },
};
