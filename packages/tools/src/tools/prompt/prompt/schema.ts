import type { FieldMap, PromptFieldDefinition } from "./types";

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

/** Converts the tool's `fields` config into an Ollama response schema. */
export function buildResponseSchema(fields: FieldMap): Record<string, unknown> {
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
