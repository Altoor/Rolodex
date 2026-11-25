import { describe, expect, it } from "vitest";
import type { ToolRunContext } from "../../model";
import { endFlowTool } from "./endFlow";

function context(
  config: Record<string, unknown>,
  toolState: unknown[] = [],
): ToolRunContext {
  return {
    userId: 1,
    runId: "run",
    taskId: 1,
    queuedTaskId: 1,
    state: "original state",
    toolState,
    outputType: "normal",
    config,
    model: null,
    decisionModel: null,
  };
}

describe("end_flow", () => {
  it("selects matching items and stops the run", async () => {
    const execution = await endFlowTool.execute(
      context(
        {
          message: "Done",
          path: "todos",
          where: { eq: { path: "done", value: true } },
        },
        [
          {
            todos: [
              { name: "keep", done: true },
              { name: "drop", done: false },
            ],
          },
        ],
      ),
    );

    expect(execution.endFlow).toBe(true);
    expect(execution.output).toMatchObject({
      done: true,
      message: "Done",
      count: 1,
      path: "todos",
      items: [{ name: "keep", done: true }],
    });
  });

  it("includes the state and full tool state when asked", async () => {
    const toolState = [{ value: 1 }];
    const execution = await endFlowTool.execute(
      context({ includeState: true, includeToolState: true }, toolState),
    );

    expect(execution.output).toMatchObject({
      state: "original state",
      toolState,
    });
  });

  it("returns an empty item list when nothing matches", async () => {
    const execution = await endFlowTool.execute(
      context({ path: "todos" }, [{ todos: [] }]),
    );

    expect(execution.output).toMatchObject({ done: true, count: 0, items: [] });
  });

  it("rejects an empty path", async () => {
    await expect(
      endFlowTool.execute(context({ path: "  " })),
    ).rejects.toThrow('"path" must be a non-empty string');
  });
});
