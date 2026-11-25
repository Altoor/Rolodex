import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolNoMatchError } from "../../../model";
import { selectFileEntryWithDecision } from "./selection";

const { systemone } = vi.hoisted(() => ({ systemone: vi.fn() }));

vi.mock("@repo/ai", () => ({
  getOllamaClient: async () => ({ systemone }),
  getOllamaKeepAlive: async () => undefined,
}));

const entries = [
  {
    id: 1,
    kind: "file" as const,
    name: "invoice.pdf",
    description: "March invoice",
    relativePath: "inbox/invoice.pdf",
  },
];

function answer(confidence: number, choice = "entry:1") {
  return {
    model: "test",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: {
      entry: {
        type: "choice" as const,
        choice,
        probabilities: { [choice]: confidence, none: 1 - confidence },
        confidence,
      },
    },
  };
}

describe("selectFileEntryWithDecision thresholds", () => {
  beforeEach(() => {
    systemone.mockReset();
  });

  it("returns a selection that meets the minimum confidence", async () => {
    systemone.mockResolvedValue(answer(0.9));

    await expect(
      selectFileEntryWithDecision(entries, "the March invoice", "model", "file", 0.8),
    ).resolves.toBe(entries[0]);
    expect(systemone).toHaveBeenCalledOnce();
  });

  it("rejects a selection below the minimum confidence", async () => {
    systemone.mockResolvedValue(answer(0.5));

    await expect(
      selectFileEntryWithDecision(entries, "the March invoice", "model", "file", 0.8),
    ).rejects.toBeInstanceOf(ToolNoMatchError);
  });

  it("does not apply the confidence gate to an explicit none answer", async () => {
    systemone.mockResolvedValue(answer(0.9, "none"));

    await expect(
      selectFileEntryWithDecision(entries, "nothing", "model", "file", 0.1),
    ).rejects.toBeInstanceOf(ToolNoMatchError);
  });
});
