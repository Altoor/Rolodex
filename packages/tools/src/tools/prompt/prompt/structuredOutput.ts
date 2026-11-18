import { isPlainObject, parseJsonObject } from "../../../utils";
import type { FieldMap, PromptFieldDefinition } from "./types";

/** Parses JSON even when a model wraps it in a fenced block or prose. */
export function parseStructuredResponse(
  text: string,
): Record<string, unknown> | null {
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

/** Validates and normalizes one parsed response against the requested fields. */
export function validateParsedFields(
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
