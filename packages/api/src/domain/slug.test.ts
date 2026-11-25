import { describe, expect, it } from "vitest";
import {
  EndpointSlugConflictError,
  InvalidEndpointSlugError,
  isUniqueViolation,
  normalizeCustomEndpointSlug,
} from "./slug";

describe("custom endpoint slugs", () => {
  it("trims and lowercases a usable slug", () => {
    expect(normalizeCustomEndpointSlug("  Recipe-Import_2 ")).toBe(
      "recipe-import_2",
    );
  });

  it("rejects spaces, punctuation, and leading separators", () => {
    for (const value of ["no spaces", "hello!", "-leading", "_leading", ""]) {
      expect(() => normalizeCustomEndpointSlug(value)).toThrow(
        InvalidEndpointSlugError,
      );
    }
  });

  it("rejects slugs longer than 64 characters", () => {
    expect(() => normalizeCustomEndpointSlug("a".repeat(65))).toThrow(
      InvalidEndpointSlugError,
    );
    expect(normalizeCustomEndpointSlug("a".repeat(64))).toHaveLength(64);
  });

  it("recognises PostgreSQL unique violations", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it("carries a readable conflict message", () => {
    expect(new EndpointSlugConflictError("taken").message).toBe("taken");
  });
});
