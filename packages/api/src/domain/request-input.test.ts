import { describe, expect, it } from "vitest";
import type { ApiEndpointRow } from "./types";
import { stateFromValue } from "./request-input";

const endpoint = {
  stateField: null,
} as ApiEndpointRow;

describe("stateFromValue", () => {
  it("uses a string body verbatim", () => {
    expect(stateFromValue("hello", endpoint)).toBe("hello");
  });

  it("pretty-prints an object body", () => {
    expect(stateFromValue({ a: 1 }, endpoint)).toBe(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });

  it("uses a top-level state string before serialising", () => {
    expect(stateFromValue({ state: "prompt", other: 1 }, endpoint)).toBe(
      "prompt",
    );
  });

  it("picks a configured state field", () => {
    const configured = { stateField: "message" } as ApiEndpointRow;

    expect(stateFromValue({ message: "chosen", state: "ignored" }, configured))
      .toBe("chosen");
  });

  it("serialises non-string configured fields", () => {
    const configured = { stateField: "payload" } as ApiEndpointRow;

    expect(stateFromValue({ payload: { a: 1 } }, configured)).toBe(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });

  it("returns an empty state for null", () => {
    expect(stateFromValue(null, endpoint)).toBe("");
  });
});
