import { describe, expect, it } from "vitest";
import type { FlowTask } from "../taskFlowTypes";
import { computeFannedOutTaskIds } from "./fan-out";

function task(
  id: number,
  overrides: Partial<FlowTask> = {},
): FlowTask {
  return {
    id,
    name: `Task ${id}`,
    type: "tool",
    fallbackTaskId: null,
    toolKey: null,
    toolConfig: null,
    toolOutputType: "normal",
    onTrueTaskId: null,
    onFalseTaskId: null,
    joinTaskId: null,
    model: null,
    decisionModel: null,
    taskResults: [],
    forceUserDecideIfNoMatch: false,
    userDecisionType: null,
    userDecisionConfig: null,
    userDecisionOptions: [],
    ...overrides,
  } as FlowTask;
}

describe("computeFannedOutTaskIds", () => {
  it("marks tasks between the per-item entry and the join", () => {
    const tasks = [
      task(1, {
        toolOutputType: "foreach",
        fallbackTaskId: 2,
        joinTaskId: 4,
      }),
      task(2, { fallbackTaskId: 3 }),
      task(3, { fallbackTaskId: 4 }),
      task(4, { toolKey: "join", fallbackTaskId: 5 }),
      task(5),
    ];

    expect(computeFannedOutTaskIds(tasks)).toEqual(new Set([2, 3]));
  });

  it("marks both sides of a branch and stops at the join", () => {
    const tasks = [
      task(1, {
        toolOutputType: "foreach",
        fallbackTaskId: 2,
        joinTaskId: 5,
      }),
      task(2, {
        toolKey: "if",
        onTrueTaskId: 3,
        onFalseTaskId: 4,
      }),
      task(3, { fallbackTaskId: 5 }),
      task(4, { fallbackTaskId: 5 }),
      task(5, { toolKey: "join", fallbackTaskId: 6 }),
      task(6),
    ];

    expect(computeFannedOutTaskIds(tasks)).toEqual(new Set([2, 3, 4]));
  });

  it("ignores foreach tasks without a join", () => {
    const tasks = [
      task(1, { toolOutputType: "foreach", fallbackTaskId: 2 }),
      task(2, { fallbackTaskId: 3 }),
      task(3),
    ];

    expect(computeFannedOutTaskIds(tasks)).toEqual(new Set());
  });
});
