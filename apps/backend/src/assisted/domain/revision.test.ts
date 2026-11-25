import { describe, expect, it } from "vitest";
import {
  RevisionValidationError,
  validateRevisionProposal,
} from "./revision";

describe("validateRevisionProposal", () => {
  it("accepts a tool config repair", () => {
    const proposal = validateRevisionProposal({
      kind: "updateToolConfig",
      explanation: "Use the expected folder name",
      confidence: 0.9,
      taskPatch: { toolConfig: { name: "alphabet" } },
      warnings: [],
    });

    expect(proposal.kind).toBe("updateToolConfig");
    expect(proposal.taskPatch?.toolConfig).toEqual({ name: "alphabet" });
  });

  it("rejects unknown kinds", () => {
    expect(() =>
      validateRevisionProposal({
        kind: "magic",
        explanation: "nope",
        confidence: 0.5,
      }),
    ).toThrow(RevisionValidationError);
  });

  it("requires a tool key for tool replacements", () => {
    expect(() =>
      validateRevisionProposal({
        kind: "replaceTask",
        explanation: "replace",
        confidence: 0.5,
        replacement: { name: "New", type: "tool" },
      }),
    ).toThrow(/toolKey/);
  });

  it("limits insertions to two", () => {
    expect(() =>
      validateRevisionProposal({
        kind: "insertBefore",
        explanation: "insert",
        confidence: 0.5,
        insertions: [
          { name: "A", type: "tool", toolKey: "create_file" },
          { name: "B", type: "tool", toolKey: "create_file" },
          { name: "C", type: "tool", toolKey: "create_file" },
        ],
      }),
    ).toThrow(/two insertions/);
  });

  it("requires a config patch", () => {
    expect(() =>
      validateRevisionProposal({
        kind: "updateToolConfig",
        explanation: "patch",
        confidence: 0.5,
      }),
    ).toThrow(/taskPatch/);
  });

  it("requires exactly two insertions around a step", () => {
    expect(() =>
      validateRevisionProposal({
        kind: "insertBeforeAndAfter",
        explanation: "insert around",
        confidence: 0.5,
        insertions: [{ name: "A", type: "tool", toolKey: "create_file" }],
      }),
    ).toThrow(/exactly two insertions/);
  });

  it("accepts a functional decision replacement", () => {
    const proposal = validateRevisionProposal({
      kind: "replaceTask",
      explanation: "make it a decision",
      confidence: 0.7,
      replacement: {
        name: "Invoice decision",
        type: "decision",
        fallbackTaskId: 12,
        decision: {
          type: "choice",
          decisionPremise: "invoice",
          instruction: "Choose exactly one option.",
          options: ["approve", "reject"],
          optionDescriptions: ["Pay it", "Reject it"],
        },
      },
    });

    expect(proposal.replacement?.decision?.options).toEqual([
      "approve",
      "reject",
    ]);
    expect(proposal.replacement?.decision?.results).toHaveLength(2);
    expect(
      proposal.replacement?.decision?.results?.every(
        (result) => result.resultTaskId === 12,
      ),
    ).toBe(true);
  });

  it("rejects a decision replacement without a wired target", () => {
    expect(() =>
      validateRevisionProposal({
        kind: "replaceTask",
        explanation: "make it a decision",
        confidence: 0.7,
        replacement: {
          name: "Invoice decision",
          type: "decision",
          decision: {
            type: "choice",
            decisionPremise: "invoice",
            instruction: "Choose exactly one option.",
            options: ["approve", "reject"],
          },
        },
      }),
    ).toThrow(/wired to a next task/);
  });

  it("requires options for list-style user decisions", () => {
    expect(() =>
      validateRevisionProposal({
        kind: "replaceTask",
        explanation: "make it a user decision",
        confidence: 0.7,
        replacement: {
          name: "Pick a folder",
          type: "userDecision",
          userDecisionType: "list",
        },
      }),
    ).toThrow(/at least one user-decision option/);
  });
});
