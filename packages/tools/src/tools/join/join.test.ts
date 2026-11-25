import { describe, expect, it } from "vitest";
import type { ToolRunContext } from "../../model";
import { joinTool } from "./join";

function context(overrides: Partial<ToolRunContext> = {}): ToolRunContext {
  return {
    userId: 1,
    runId: "00000000-0000-0000-0000-000000000001",
    taskId: 30,
    queuedTaskId: 10,
    state: "input",
    toolState: [],
    outputType: "normal",
    config: null,
    model: null,
    decisionModel: null,
    ...overrides,
  };
}

describe("join tool", () => {
  it("collects branches in index order and appends by default", async () => {
    const execution = await joinTool.execute(
      context({
        fork: {
          groupId: "group",
          branches: [
            {
              index: 0,
              queuedTaskId: 11,
              taskId: 20,
              taskName: "A",
              status: "completed",
              result: { value: "a" },
              toolState: [{ seed: 1 }],
              state: "input",
            },
            {
              index: 1,
              queuedTaskId: 12,
              taskId: 20,
              taskName: "A",
              status: "failed",
              result: { note: "boom" },
              toolState: [],
              state: "input",
            },
          ],
        },
      }),
    );

    expect(execution.appendOutput).toBe(true);
    expect(execution.output).toMatchObject({
      kind: "join",
      groupId: "group",
      count: 2,
      completed: 1,
      failed: 1,
    });
    expect((execution.output as { branches: unknown[] }).branches).toEqual([
      {
        index: 0,
        queuedTaskId: 11,
        taskId: 20,
        taskName: "A",
        status: "completed",
        result: { value: "a" },
      },
      {
        index: 1,
        queuedTaskId: 12,
        taskId: 20,
        taskName: "A",
        status: "failed",
        result: { note: "boom" },
      },
    ]);
  });

  it("can omit branch payloads and disable appending", async () => {
    const execution = await joinTool.execute(
      context({
        config: {
          includeResults: false,
          includeToolState: true,
          includeState: true,
          appendState: false,
        },
        fork: {
          groupId: "group",
          branches: [
            {
              index: 0,
              queuedTaskId: 11,
              taskId: 20,
              taskName: "A",
              status: "completed",
              result: { value: "a" },
              toolState: [{ seed: 1 }],
              state: "branch state",
            },
          ],
        },
      }),
    );

    expect(execution.appendOutput).toBe(false);
    expect((execution.output as { branches: unknown[] }).branches).toEqual([
      {
        index: 0,
        queuedTaskId: 11,
        taskId: 20,
        taskName: "A",
        status: "completed",
        toolState: [{ seed: 1 }],
        state: "branch state",
      },
    ]);
  });

  it("requires join context", async () => {
    await expect(joinTool.execute(context())).rejects.toThrow(
      /After all items/,
    );
  });
});
