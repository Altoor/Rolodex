import { describe, expect, it } from "vitest";
import { withMarkdownFallback } from "./name";

describe("withMarkdownFallback", () => {
  it("appends .md when the name has no extension", () => {
    expect(withMarkdownFallback("ALPH")).toBe("ALPH.md");
    expect(withMarkdownFallback("meeting notes")).toBe("meeting notes.md");
  });

  it("treats a trailing dot as missing", () => {
    expect(withMarkdownFallback("ALPH.")).toBe("ALPH.md");
    expect(withMarkdownFallback("ALPH...")).toBe("ALPH.md");
  });

  it("keeps known plaintext extensions", () => {
    expect(withMarkdownFallback("note.txt")).toBe("note.txt");
    expect(withMarkdownFallback("README.md")).toBe("README.md");
  });

  it("keeps explicit extensions so non-plaintext types are still rejected", () => {
    expect(withMarkdownFallback("archive.zip")).toBe("archive.zip");
    expect(withMarkdownFallback("photo.png")).toBe("photo.png");
  });
});
