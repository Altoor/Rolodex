import { describe, expect, it } from "vitest";
import {
  apiKeyMatches,
  generateApiKey,
  generateEndpointSlug,
  hashApiKey,
} from "./keys";

describe("API keys", () => {
  it("creates a prefixed key and a stable hash", () => {
    const key = generateApiKey();

    expect(key.apiKey.startsWith("ak_")).toBe(true);
    expect(key.keyHash).toBe(hashApiKey(key.apiKey));
    expect(key.keyPrefix).toBe(key.apiKey.slice(0, 10));
    expect(key.keyLastFour).toBe(key.apiKey.slice(-4));
  });

  it("matches only the generated key", () => {
    const key = generateApiKey();
    const other = generateApiKey();

    expect(apiKeyMatches(key.apiKey, key.keyHash)).toBe(true);
    expect(apiKeyMatches(other.apiKey, key.keyHash)).toBe(false);
    expect(apiKeyMatches("", key.keyHash)).toBe(false);
  });

  it("generates distinct URL-safe slugs", () => {
    const first = generateEndpointSlug();
    const second = generateEndpointSlug();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
