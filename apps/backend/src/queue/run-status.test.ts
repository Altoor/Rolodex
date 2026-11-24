import { describe, expect, it } from "vitest";
import { standardRunOutcome } from "./run-status";

describe("standardRunOutcome", () => {
  it("completes a run with no failed steps", () => {
    expect(standardRunOutcome([])).toBe("completed");
  });

  it("fails a run with an unresolved failed step", () => {
    expect(standardRunOutcome([null, { note: "boom" }])).toBe("failed");
  });

  it("ignores failed rows that were retried", () => {
    expect(standardRunOutcome([{ retried: true }])).toBe("completed");
  });

  it("still fails when another failed step was not retried", () => {
    expect(
      standardRunOutcome([{ retried: true }, { note: "boom" }]),
    ).toBe("failed");
  });

  it("treats a string retried flag as unresolved", () => {
    expect(standardRunOutcome([{ retried: "true" }])).toBe("failed");
  });
});
