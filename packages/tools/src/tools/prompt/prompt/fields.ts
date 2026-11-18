import { isPlainObject } from "../../../utils";
import { ToolInputError } from "../../../model";
import type { FieldMap, PromptFieldDefinition, PromptFieldType } from "./types";

const FIELD_TYPES: PromptFieldType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "enum",
];

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

/** Parses and validates the optional `fields` config object. */
export function readFields(
  input: Record<string, unknown>,
): FieldMap | undefined {
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
