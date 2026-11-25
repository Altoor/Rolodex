import { describe, expect, it } from "vitest";
import { snapshotReferences } from "./start-run-snapshot";

describe("snapshotReferences", () => {
  it("collects task, result, and user-decision targets", () => {
    const refs = snapshotReferences({
      task: {
        fallbackTaskId: 10,
        onTrueTaskId: 11,
        onFalseTaskId: 12,
        joinTaskId: 13,
      },
      results: [
        { resultTaskId: 20 },
        { resultTaskId: null },
        { resultTaskId: 21 },
      ],
      userDecisionOptions: [{ resultTaskId: 30 }, {}],
    });

    expect(refs.sort()).toEqual([10, 11, 12, 13, 20, 21, 30]);
  });

  it("accepts a flat builder snapshot", () => {
    expect(
      snapshotReferences({ fallbackTaskId: 7, onTrueTaskId: 8 }),
    ).toEqual([7, 8]);
  });

  it("ignores missing and non-numeric targets", () => {
    expect(
      snapshotReferences({
        task: { fallbackTaskId: null, onTrueTaskId: "9" },
        results: [{ resultTaskId: Number.NaN }],
      }),
    ).toEqual([]);
  });
});
