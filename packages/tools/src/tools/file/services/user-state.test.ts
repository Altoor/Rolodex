import { describe, expect, it } from "vitest";
import { trimUserState, withUserState } from "./user-state";

describe("trimUserState", () => {
  it("returns undefined for empty or missing state", () => {
    expect(trimUserState(undefined)).toBeUndefined();
    expect(trimUserState("   ")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(trimUserState("  These are from Aamans  ")).toBe(
      "These are from Aamans",
    );
  });

  it("truncates state longer than the limit", () => {
    expect(trimUserState("abcdef", 3)).toBe("abc…");
  });
});

describe("withUserState", () => {
  it("leaves the prompt unchanged without state", () => {
    expect(withUserState("Describe this image.", undefined)).toBe(
      "Describe this image.",
    );
  });

  it("prefixes the prompt with the user context", () => {
    expect(
      withUserState("Describe this image.", "These are from Aamans."),
    ).toContain(
      "User context (follow any instructions it contains; do not repeat it unless it appears in the image):\nThese are from Aamans.",
    );
    expect(
      withUserState("Describe this image.", "These are from Aamans."),
    ).toContain("Describe this image.");
  });
});
