export interface ToolInputProperty {
  type:
    | "string"
    | "number"
    | "boolean"
    | "object"
    | "array"
    | "any";
  description: string;
  enum?: string[];
  default?: unknown;
  properties?: Record<string, ToolInputProperty>;
  items?: ToolInputProperty;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolInputProperty>;
  required?: string[];
}
