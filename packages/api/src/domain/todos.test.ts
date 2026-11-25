import { describe, expect, it } from "vitest";
import { parseTodoId, parseTodoListQuery, parseTodoUpdate } from "./todos";

function query(params: Record<string, string> = {}) {
  return new URLSearchParams(params);
}

describe("parseTodoListQuery", () => {
  it("defaults to all todos, first page", () => {
    expect(parseTodoListQuery(query())).toEqual({
      done: "all",
      includeArchived: false,
      limit: 50,
      offset: 0,
    });
  });

  it("filters not-done and done todos", () => {
    expect(parseTodoListQuery(query({ done: "false" })).done).toBe(false);
    expect(parseTodoListQuery(query({ done: "not_done" })).done).toBe(false);
    expect(parseTodoListQuery(query({ done: "notDone" })).done).toBe(false);
    expect(parseTodoListQuery(query({ done: "true" })).done).toBe(true);
    expect(parseTodoListQuery(query({ done: "all" })).done).toBe("all");
  });

  it("accepts pagination and archived flags", () => {
    expect(
      parseTodoListQuery(
        query({ limit: "25", offset: "50", includeArchived: "true" }),
      ),
    ).toEqual({
      done: "all",
      includeArchived: true,
      limit: 25,
      offset: 50,
    });
  });

  it("rejects unknown done values", () => {
    expect(() => parseTodoListQuery(query({ done: "maybe" }))).toThrow(
      '"done" must be "all", "true", or "false"',
    );
  });

  it("rejects out-of-range limits", () => {
    expect(() => parseTodoListQuery(query({ limit: "0" }))).toThrow();
    expect(() => parseTodoListQuery(query({ limit: "201" }))).toThrow();
  });

  it("rejects negative offsets", () => {
    expect(() => parseTodoListQuery(query({ offset: "-1" }))).toThrow();
  });
});

describe("parseTodoUpdate", () => {
  it("reads the done flag", () => {
    expect(parseTodoUpdate({ done: true })).toEqual({ done: true });
    expect(parseTodoUpdate({ done: false })).toEqual({ done: false });
  });

  it("rejects non-object bodies", () => {
    expect(() => parseTodoUpdate([])).toThrow(
      "Request body must be a JSON object",
    );
    expect(() => parseTodoUpdate(null)).toThrow();
  });

  it("rejects a missing or non-boolean done flag", () => {
    expect(() => parseTodoUpdate({})).toThrow('"done" must be a boolean');
    expect(() => parseTodoUpdate({ done: "true" })).toThrow(
      '"done" must be a boolean',
    );
  });
});

describe("parseTodoId", () => {
  it("parses positive integers", () => {
    expect(parseTodoId("42")).toBe(42);
  });

  it("rejects missing or invalid ids", () => {
    expect(() => parseTodoId(undefined)).toThrow();
    expect(() => parseTodoId("0")).toThrow();
    expect(() => parseTodoId("1.5")).toThrow();
    expect(() => parseTodoId("abc")).toThrow();
  });
});
