import { describe, expect, it } from "vitest";
import { isUuid } from "./uuid";

describe("isUuid", () => {
  it("accepts canonical UUIDs", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("6F9619FF-8B86-4011-B42D-00C04FC964FF")).toBe(true);
  });

  it("rejects non-UUID text before it reaches a uuid column", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("1")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false);
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000x")).toBe(false);
  });
});
