import { describe, expect, it } from "vitest";
import { normalizeApiOrigin, resolveApiOrigin } from "./apiOrigin";

const location = {
  protocol: "https:",
  hostname: "unraid.example.ts.net",
  port: "8443",
  origin: "https://unraid.example.ts.net:8443",
};

describe("normalizeApiOrigin", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(normalizeApiOrigin("  https://api.example.com///  ")).toBe(
      "https://api.example.com",
    );
  });

  it("ignores empty and non-string values", () => {
    expect(normalizeApiOrigin("   ")).toBeUndefined();
    expect(normalizeApiOrigin(null)).toBeUndefined();
    expect(normalizeApiOrigin(42)).toBeUndefined();
  });

  it("treats a slash-only value as unset", () => {
    expect(normalizeApiOrigin("/")).toBeUndefined();
    expect(normalizeApiOrigin("///")).toBeUndefined();
  });
});

describe("resolveApiOrigin", () => {
  it("prefers the runtime-configured origin", () => {
    expect(
      resolveApiOrigin({ configured: "https://api.example.com/", location }),
    ).toBe("https://api.example.com");
  });

  it("derives the API port when the web app uses a non-default port", () => {
    expect(
      resolveApiOrigin({
        location: { ...location, port: "3001", origin: "https://web:3001" },
      }),
    ).toBe("https://unraid.example.ts.net:4000");
  });

  it("uses the web origin when it is served on a default port", () => {
    expect(
      resolveApiOrigin({
        location: { ...location, port: "443", origin: "https://web" },
      }),
    ).toBe("https://web");
  });

  it("falls back to the local backend during server rendering", () => {
    expect(resolveApiOrigin({})).toBe("http://localhost:4000");
  });
});
