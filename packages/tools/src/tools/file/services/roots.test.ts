import { describe, expect, it } from "vitest";
import { ToolInputError } from "../../../model";
import { selectDefaultRootFolder } from "./roots";

describe("selectDefaultRootFolder", () => {
  it("falls back to the files root when no root folders exist", () => {
    expect(selectDefaultRootFolder([])).toBeNull();
  });

  it("uses the only configured root folder", () => {
    const root = { relativePath: "workspace" };
    expect(selectDefaultRootFolder([root])).toBe(root);
  });

  it("requires an explicit parent when several root folders exist", () => {
    expect(() =>
      selectDefaultRootFolder([
        { relativePath: "alpha" },
        { relativePath: "beta" },
      ]),
    ).toThrow(ToolInputError);

    expect(() =>
      selectDefaultRootFolder([
        { relativePath: "alpha" },
        { relativePath: "beta" },
      ]),
    ).toThrow('multiple root folders are configured ("alpha", "beta")');
  });
});
