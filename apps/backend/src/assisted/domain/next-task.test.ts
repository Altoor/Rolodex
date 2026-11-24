import { describe, expect, it } from "vitest";
import { NextTaskDraftError, parseNextTaskDraft } from "./next-task";

describe("parseNextTaskDraft", () => {
  it("normalizes a valid tool draft", () => {
    expect(
      parseNextTaskDraft({
        name: "  Create the folder  ",
        explanation: "Create ABC first.",
        type: "tool",
        toolKey: " create_folder ",
        toolConfig: { path: "ABC" },
        toolOutputType: "foreach",
      }),
    ).toEqual({
      name: "Create the folder",
      explanation: "Create ABC first.",
      type: "tool",
      toolKey: "create_folder",
      toolConfig: { path: "ABC" },
      toolOutputType: "foreach",
    });
  });

  it("rejects non-tool drafts so a branch cannot create an unrunnable task", () => {
    expect(() =>
      parseNextTaskDraft({
        name: "Ask the user",
        type: "userDecision",
        toolKey: null,
      }),
    ).toThrow(NextTaskDraftError);
  });

  it("requires a name and a tool key", () => {
    expect(() => parseNextTaskDraft({ type: "tool", toolKey: "set_state" })).toThrow(
      "needs a name",
    );
    expect(() => parseNextTaskDraft({ name: "Do it", type: "tool" })).toThrow(
      "needs a toolKey",
    );
  });
});
