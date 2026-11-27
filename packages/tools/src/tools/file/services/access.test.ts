import { describe, expect, it } from "vitest";
import { isPathHidden } from "./access";

describe("isPathHidden", () => {
  it("hides the private folder itself", () => {
    expect(isPathHidden("private-a", ["private-a"])).toBe(true);
  });

  it("hides descendants of a private folder", () => {
    expect(isPathHidden("private-a/notes/today.txt", ["private-a"])).toBe(true);
  });

  it("does not hide siblings that only share a name prefix", () => {
    expect(isPathHidden("private-ab/notes.txt", ["private-a"])).toBe(false);
  });

  it("does not hide unrelated paths", () => {
    expect(isPathHidden("public/notes.txt", ["private-a"])).toBe(false);
  });
});
