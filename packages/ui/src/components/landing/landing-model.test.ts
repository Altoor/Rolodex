import { describe, expect, it } from "vitest";
import { groupRuns, type QueuedTaskStep } from "./landing-model";

function step(overrides: Partial<QueuedTaskStep>): QueuedTaskStep {
  return {
    id: 1,
    taskId: 1,
    status: "completed",
    runId: "run-1",
    depth: 0,
    result: null,
    pendingChoice: null,
    model: null,
    decisionModel: null,
    state: "{}",
    task: { id: 1, name: "Task", type: "tool" },
    ...overrides,
  };
}

describe("groupRuns", () => {
  it("does not mark a run failed when its failed step was retried", () => {
    const [run] = groupRuns([
      step({ id: 1, status: "failed", result: { retried: true } }),
      step({ id: 2, status: "completed" }),
    ]);

    expect(run?.failed).toBe(false);
  });

  it("marks a run failed while a failed step is unresolved", () => {
    const [run] = groupRuns([
      step({ id: 1, status: "failed", result: { note: "boom" } }),
    ]);

    expect(run?.failed).toBe(true);
  });

  it("keeps a pending run active", () => {
    const [run] = groupRuns([step({ id: 1, status: "queued" })]);

    expect(run?.pending).toBe(true);
  });
});
