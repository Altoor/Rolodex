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

export type FieldMap = Record<string, PromptFieldDefinition>;

export type PromptInvalidBehavior = "fail" | "text";
