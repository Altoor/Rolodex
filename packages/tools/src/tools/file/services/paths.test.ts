import { describe, expect, it } from "vitest";
import { isIgnoredPath, isInternalPath } from "./paths";

describe("isInternalPath", () => {
  it("matches the internal root directories", () => {
    expect(isInternalPath(".trials")).toBe(true);
    expect(isInternalPath(".tmp")).toBe(true);
  });

  it("matches descendants of internal directories", () => {
    expect(isInternalPath(".trials/run-1/attempt-2/notes.md")).toBe(true);
    expect(isInternalPath(".tmp/upload-123/photo.jpg")).toBe(true);
  });

  it("matches internal directories nested below a user path", () => {
    expect(isInternalPath("project/.trials/run-1/notes.md")).toBe(true);
    expect(isInternalPath("project/.tmp/notes.md")).toBe(true);
  });

  it("does not match user paths that merely contain the name", () => {
    expect(isInternalPath("trials/notes.md")).toBe(false);
    expect(isInternalPath("project/.trials-archive/notes.md")).toBe(false);
    expect(isInternalPath("project/.tmp-notes/notes.md")).toBe(false);
    expect(isInternalPath("project/notes.md")).toBe(false);
    expect(isInternalPath("")).toBe(false);
  });
});

describe("isIgnoredPath", () => {
  it("ignores internal roots and their descendants", () => {
    expect(isIgnoredPath(".trials")).toBe(true);
    expect(isIgnoredPath(".trials/run-1/attempt-2/notes.md")).toBe(true);
    expect(isIgnoredPath(".tmp")).toBe(true);
    expect(isIgnoredPath(".tmp/upload-123/photo.jpg")).toBe(true);
  });

  it("ignores system files anywhere in the tree", () => {
    expect(isIgnoredPath(".DS_Store")).toBe(true);
    expect(isIgnoredPath("project/.DS_Store")).toBe(true);
    expect(isIgnoredPath(".gitkeep")).toBe(true);
    expect(isIgnoredPath(".tmp-upload")).toBe(true);
  });

  it("keeps normal user paths", () => {
    expect(isIgnoredPath("")).toBe(false);
    expect(isIgnoredPath("project")).toBe(false);
    expect(isIgnoredPath("project/notes.md")).toBe(false);
    expect(isIgnoredPath("trials/notes.md")).toBe(false);
  });
});
