import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "../model";
import {
  ToolConfigValidationError,
  validateToolConfig,
} from "./validate-config";

const definition: ToolDefinition = {
  key: "demo",
  name: "Demo",
  description: "Demo tool",
  category: "todo",
  inputMode: "json",
  outputDescription: "nothing",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "name" },
      count: { type: "number", description: "count" },
      mode: { type: "string", description: "mode", enum: ["a", "b"] },
    },
    required: ["name"],
  },
};

describe("validateToolConfig", () => {
  it("accepts a valid config", () => {
    expect(() =>
      validateToolConfig(definition, { name: "x", count: 2, mode: "a" }),
    ).not.toThrow();
  });

  it("rejects a missing required property", () => {
    expect(() => validateToolConfig(definition, { count: 2 })).toThrow(
      /needs "name"/,
    );
  });

  it("rejects a wrong property type", () => {
    expect(() =>
      validateToolConfig(definition, { name: 4 }),
    ).toThrow(ToolConfigValidationError);
  });

  it("rejects a value outside the enum", () => {
    expect(() =>
      validateToolConfig(definition, { name: "x", mode: "c" }),
    ).toThrow(/one of a, b/);
  });
});
