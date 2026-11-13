import { getModelForUser, ollama } from "@repo/ai";
import {
  isPlainObject,
  mergeToolInput,
  parseJsonObject,
  readBoolean,
  readPath,
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

export type PromptFieldType =
  "string" | "number" | "boolean" | "object" | "array" | "enum";

export interface PromptFieldDefinition {
  type: PromptFieldType;
  description?: string;
  /** Defaults to true. Optional fields are omitted when the model skips them. */
  required?: boolean;
  /** Allowed values for `type: "enum"`. Also accepts `values` in config. */
  enum?: unknown[];
  values?: unknown[];
  default?: unknown;
  properties?: Record<string, PromptFieldDefinition>;
  items?: PromptFieldDefinition;
}

type FieldMap = Record<string, PromptFieldDefinition>;

export type PromptInvalidBehavior = "fail" | "text";

const FIELD_TYPES: PromptFieldType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "enum",
];

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

function readInvalidBehavior(
  input: Record<string, unknown>,
): PromptInvalidBehavior {
  const value = readString(input, "onInvalid") ?? "fail";

  if (value !== "fail" && value !== "text") {
    throw new ToolInputError(`"onInvalid" must be "fail" or "text"`);
  }

  return value;
}

/**
 * Replaces `{{path}}` placeholders with values from the merged tool input, so
 * a prompt can embed an earlier tool's output such as `{{content}}` or
 * `{{folder.name}}`. Missing paths are an error rather than silently becoming
 * the literal placeholder.
 */
export function interpolatePromptTemplate(
  template: string,
  source: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_placeholder, rawPath: string) => {
      const path = rawPath.trim();
      const value = readPath(source, path);

      if (value === undefined) {
        throw new ToolInputError(
          `prompt references "{{${path}}}", but that path is not present in toolState`,
        );
      }

      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }

      return JSON.stringify(value);
    },
  );
}

function readFieldDefinition(
  name: string,
  value: unknown,
): PromptFieldDefinition {
  if (!isPlainObject(value)) {
    throw new ToolInputError(`"fields.${name}" must be an object`);
  }

  const type = value.type;
  if (
    typeof type !== "string" ||
    !FIELD_TYPES.includes(type as PromptFieldType)
  ) {
    throw new ToolInputError(
      `"fields.${name}.type" must be one of: ${FIELD_TYPES.join(", ")}`,
    );
  }

  const description = value.description;
  if (description !== undefined && typeof description !== "string") {
    throw new ToolInputError(`"fields.${name}.description" must be a string`);
  }

  const required = value.required;
  if (required !== undefined && typeof required !== "boolean") {
    throw new ToolInputError(`"fields.${name}.required" must be a boolean`);
  }

  const definition: PromptFieldDefinition = {
    type: type as PromptFieldType,
  };

  if (description !== undefined) definition.description = description;
  if (required !== undefined) definition.required = required;
  if (value.default !== undefined) definition.default = value.default;

  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum)) {
      throw new ToolInputError(`"fields.${name}.enum" must be an array`);
    }
    definition.enum = value.enum;
  }

  if (value.values !== undefined) {
    if (!Array.isArray(value.values)) {
      throw new ToolInputError(`"fields.${name}.values" must be an array`);
    }
    definition.values = value.values;
  }

  if (definition.type === "enum") {
    const allowed = definition.values ?? definition.enum;
    if (!allowed || allowed.length === 0) {
      throw new ToolInputError(
        `"fields.${name}" of type "enum" requires a non-empty "values" array`,
      );
    }
  }

  if (value.properties !== undefined) {
    if (!isPlainObject(value.properties)) {
      throw new ToolInputError(`"fields.${name}.properties" must be an object`);
    }
    definition.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, nested]) => [
        key,
        readFieldDefinition(`${name}.${key}`, nested),
      ]),
    );
  }

  if (value.items !== undefined) {
    definition.items = readFieldDefinition(`${name}[]`, value.items);
  }

  if (definition.type === "array" && !definition.items) {
    throw new ToolInputError(
      `"fields.${name}" of type "array" requires an "items" definition`,
    );
  }

  return definition;
}

function readFields(input: Record<string, unknown>): FieldMap | undefined {
  const value = input.fields;
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new ToolInputError(`"fields" must be an object`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return undefined;

  return Object.fromEntries(
    entries.map(([name, field]) => [name, readFieldDefinition(name, field)]),
  );
}

function fieldJsonSchema(
  field: PromptFieldDefinition,
): Record<string, unknown> {
  if (field.type === "enum") {
    return {
      type: "string",
      enum: field.values ?? field.enum,
      ...(field.description ? { description: field.description } : {}),
    };
  }

  if (field.type === "object") {
    const properties = field.properties ?? {};
    const required = Object.entries(properties)
      .filter(([, nested]) => nested.required !== false)
      .map(([name]) => name);

    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(properties).map(([name, nested]) => [
          name,
          fieldJsonSchema(nested),
        ]),
      ),
      ...(required.length > 0 ? { required } : {}),
      ...(field.description ? { description: field.description } : {}),
    };
  }

  if (field.type === "array") {
    return {
      type: "array",
      items: fieldJsonSchema(
        field.items ?? { type: "string", required: field.required },
      ),
      ...(field.description ? { description: field.description } : {}),
    };
  }

  return {
    type: field.type,
    ...(field.description ? { description: field.description } : {}),
  };
}

function buildResponseSchema(fields: FieldMap): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [
        name,
        fieldJsonSchema(field),
      ]),
    ),
    required: Object.entries(fields)
      .filter(([, field]) => field.required !== false)
      .map(([name]) => name),
    additionalProperties: false,
  };
}

function parseStructuredResponse(text: string): Record<string, unknown> | null {
  const direct = parseJsonObject(text);
  if (direct) return direct;

  // Some models still wrap schema-constrained output in a fenced block.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = parseJsonObject(fenced[1]);
    if (parsed) return parsed;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return parseJsonObject(text.slice(start, end + 1));
  }

  return null;
}

function validateFieldValue(
  field: PromptFieldDefinition,
  value: unknown,
  path: string,
): unknown {
  switch (field.type) {
    case "string":
      if (typeof value !== "string") {
        throw new Error(`field "${path}" must be a string`);
      }
      return value;

    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`field "${path}" must be a number`);
      }
      return value;

    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(`field "${path}" must be a boolean`);
      }
      return value;

    case "enum": {
      const allowed = field.values ?? field.enum ?? [];
      if (!allowed.includes(value)) {
        throw new Error(
          `field "${path}" must be one of: ${allowed
            .map((item) => JSON.stringify(item))
            .join(", ")}`,
        );
      }
      return value;
    }

    case "object": {
      if (!isPlainObject(value)) {
        throw new Error(`field "${path}" must be an object`);
      }

      const properties = field.properties;
      if (!properties) return value;

      const result: Record<string, unknown> = {};

      for (const [name, nested] of Object.entries(properties)) {
        const nestedValue = value[name];
        const nestedPath = `${path}.${name}`;

        if (nestedValue === undefined || nestedValue === null) {
          if (nested.default !== undefined) {
            result[name] = nested.default;
          } else if (nested.required !== false) {
            throw new Error(`field "${nestedPath}" is required`);
          }
          continue;
        }

        result[name] = validateFieldValue(nested, nestedValue, nestedPath);
      }

      return result;
    }

    case "array": {
      if (!Array.isArray(value)) {
        throw new Error(`field "${path}" must be an array`);
      }

      if (!field.items) return value;

      return value.map((item, index) =>
        validateFieldValue(field.items!, item, `${path}.${index}`),
      );
    }
  }
}

function validateParsedFields(
  fields: FieldMap,
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(fields)) {
    const value = parsed[name];

    if (value === undefined || value === null) {
      if (field.default !== undefined) {
        result[name] = field.default;
      } else if (field.required !== false) {
        throw new Error(`field "${name}" is required`);
      }
      continue;
    }

    result[name] = validateFieldValue(field, value, name);
  }

  return result;
}

const definition: ToolDefinition = {
  key: "prompt",
  name: "Prompt",
  description:
    "Send a prompt to an installed Ollama model, wait for the answer, and return it. Optionally request structured fields.",
  category: "ai",
  inputMode: "text",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "The prompt to send. Defaults to the queued task's state. Supports `{{path}}` placeholders that resolve against earlier toolState, for example `{{content}}` or `{{folder.name}}`.",
      },
      system: {
        type: "string",
        description:
          "Optional system prompt. Supports the same `{{path}}` placeholders as `prompt`.",
      },
      model: {
        type: "string",
        description:
          "Optional generation model override. Defaults to the model inherited by the run context, then the user's default generation model.",
      },
      format: {
        type: "object",
        description:
          "Optional JSON schema passed to Ollama for structured output. Cannot be combined with `fields`.",
      },
      fields: {
        type: "object",
        description:
          'Optional named output fields, for example { "name": { "type": "string" } }. Each field becomes a tool-state path.',
      },
      onInvalid: {
        type: "string",
        description:
          'What to do when the model response does not match `fields`: "fail" throws, "text" keeps the raw answer in `text`.',
        enum: ["fail", "text"],
        default: "fail",
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
    "The model answer as text, plus the model name and optional thinking text. With `fields`, each parsed field is also returned and appended to toolState.",
  exampleConfig: {
    model: "gemma4:e4b",
    prompt:
      "Return a short folder name and a one-sentence description for a folder of tax documents.",
    fields: {
      name: {
        type: "string",
        description: "Short folder name. No slashes.",
      },
      description: {
        type: "string",
        description: "One or two sentences describing the contents.",
      },
    },
  },
};

export const promptTool: Tool = {
  definition,

  async execute(context): Promise<ToolExecution> {
    const input = mergeToolInput(context);
    const useToolState = readBoolean(input, "useToolState") ?? false;
    const promptTemplate = readString(input, "prompt");
    const basePrompt =
      promptTemplate === undefined
        ? context.state
        : interpolatePromptTemplate(promptTemplate, input);

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

    const systemTemplate = readString(input, "system");
    const system =
      systemTemplate === undefined
        ? undefined
        : interpolatePromptTemplate(systemTemplate, input);
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
