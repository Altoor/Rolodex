import type { ToolConfig, ToolDefinition } from "../model";
import type { ToolInputProperty } from "../model";

export class ToolConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolConfigValidationError";
  }
}

function matchesType(property: ToolInputProperty, value: unknown): boolean {
  switch (property.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "any":
      return true;
  }
}

/**
 * Validates the stored part of a tool config against the tool's input schema.
 *
 * Only declared properties are checked; tools may keep extra UI/forward-
 * compatible keys. Missing required values and wrong primitive types are
 * rejected so an assisted revision cannot save a config the tool cannot run.
 */
export function validateToolConfig(
  definition: ToolDefinition,
  config: ToolConfig | null | undefined,
): void {
  const value = config ?? {};

  for (const key of definition.inputSchema.required ?? []) {
    const property = definition.inputSchema.properties[key];
    if (!property) continue;
    if (value[key] === undefined || value[key] === null) {
      throw new ToolConfigValidationError(
        `"${definition.key}" needs "${key}"`,
      );
    }
  }

  for (const [key, property] of Object.entries(
    definition.inputSchema.properties,
  )) {
    const entry = value[key];
    if (entry === undefined || entry === null) continue;

    if (!matchesType(property, entry)) {
      throw new ToolConfigValidationError(
        `"${definition.key}" expects "${key}" to be ${property.type}`,
      );
    }

    if (
      property.enum &&
      typeof entry === "string" &&
      !property.enum.includes(entry)
    ) {
      throw new ToolConfigValidationError(
        `"${definition.key}" expects "${key}" to be one of ${property.enum.join(", ")}`,
      );
    }
  }
}
