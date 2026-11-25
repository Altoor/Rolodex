import { describe, expect, it } from "vitest";
import type { QueuedRow } from "../../types";
import { planForeach } from "./enqueue-foreach";

function row(overrides: Partial<QueuedRow> = {}): QueuedRow {
  return {
    id: 10,
    taskId: 1,
    state: "input",
    toolState: [],
    parentQueuedTaskId: null,
    forkGroupId: null,
    forkIndex: null,
    isJoin: false,
    depth: 0,
    status: "running",
    runId: "00000000-0000-0000-0000-000000000001",
    result: null,
    pendingChoice: null,
    queued_at: new Date("2026-01-01T00:00:00Z"),
    queued_by: 1,
    model: null,
    decisionModel: null,
    ...overrides,
  };
}

describe("planForeach", () => {
  it("creates per-item branches plus one waiting join row", () => {
    const plan = planForeach({
      row: row(),
      execution: {
        output: null,
        summary: "",
        foreach: { items: [{ a: 1 }, { a: 2 }] },
      },
      nextTaskId: 20,
      nextState: "input",
      nextToolState: [],
      joinTaskId: 30,
    });

    expect(plan.failureNote).toBeUndefined();
    expect(plan.nextTaskId).toBe(20);
    expect(plan.nextSteps).toHaveLength(3);

    const [first, second, join] = plan.nextSteps;
    expect(first).toMatchObject({
      taskId: 20,
      forkIndex: 0,
      isJoin: false,
    });
    expect(second).toMatchObject({ taskId: 20, forkIndex: 1, isJoin: false });
    expect(first!.forkGroupId).toBe(plan.forkGroupId);
    expect(second!.forkGroupId).toBe(plan.forkGroupId);

    expect(join).toMatchObject({
      taskId: 30,
      status: "waiting",
      isJoin: true,
      forkIndex: null,
      forkGroupId: plan.forkGroupId,
    });
    expect(join!.toolState).toEqual([]);
  });

  it("queues the join immediately when the foreach has no items", () => {
    const plan = planForeach({
      row: row(),
      execution: { output: null, summary: "", foreach: { items: [] } },
      nextTaskId: 20,
      nextState: "input",
      nextToolState: [{ seed: true }],
      joinTaskId: 30,
    });

    expect(plan.nextSteps).toHaveLength(1);
    expect(plan.nextSteps[0]).toMatchObject({
      taskId: 30,
      status: "queued",
      isJoin: true,
      toolState: [{ seed: true }],
    });
  });

  it("keeps the old no-join fan-out free of fork lineage", () => {
    const plan = planForeach({
      row: row(),
      execution: { output: null, summary: "", foreach: { items: [{ a: 1 }] } },
      nextTaskId: 20,
      nextState: "input",
      nextToolState: [],
    });

    expect(plan.nextSteps).toHaveLength(1);
    expect(plan.nextSteps[0]!.forkGroupId).toBeUndefined();
    expect(plan.nextSteps[0]!.forkIndex).toBeUndefined();
  });

  it("rejects nested fan-outs inside an active barrier", () => {
    const plan = planForeach({
      row: row({ forkGroupId: "00000000-0000-0000-0000-000000000002" }),
      execution: { output: null, summary: "", foreach: { items: [{ a: 1 }] } },
      nextTaskId: 20,
      nextState: "input",
      nextToolState: [],
      joinTaskId: 30,
    });

    expect(plan.nextSteps).toEqual([]);
    expect(plan.failureNote).toMatch(/cannot be nested/);
  });
});
