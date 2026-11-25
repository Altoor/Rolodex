import { describe, expect, it } from "vitest";
import { diffDecision } from "./decision-diff";

const base = {
  decisionPremise: "Should this be approved?",
  instruction: "Approve small invoices.",
  options: ["approve", "reject"],
  optionDescriptions: ["valid invoice", "invalid invoice"],
};

describe("diffDecision", () => {
  it("reports premise and instruction changes", () => {
    const diff = diffDecision(base, {
      ...base,
      decisionPremise: "Is this invoice valid?",
      instruction: "Approve invoices under 200 dollars.",
    });

    expect(diff.hasChanges).toBe(true);
    expect(diff.fields).toEqual([
      {
        field: "premise",
        label: "Decision premise",
        before: "Should this be approved?",
        after: "Is this invoice valid?",
      },
      {
        field: "instruction",
        label: "Instruction",
        before: "Approve small invoices.",
        after: "Approve invoices under 200 dollars.",
      },
    ]);
  });

  it("reports changed option descriptions for the same option names", () => {
    const diff = diffDecision(base, {
      ...base,
      optionDescriptions: ["invoice from a known vendor", "invalid invoice"],
    });

    expect(diff.fields).toEqual([]);
    expect(diff.options).toEqual([
      {
        kind: "description",
        option: "approve",
        before: "valid invoice",
        after: "invoice from a known vendor",
      },
    ]);
  });

  it("reports added and removed options", () => {
    const diff = diffDecision(base, {
      ...base,
      options: ["approve", "escalate"],
      optionDescriptions: ["valid invoice", "route to a human"],
    });

    expect(diff.options).toEqual([
      { kind: "added", option: "escalate" },
      { kind: "removed", option: "reject" },
    ]);
  });

  it("is empty when nothing changed or a side is missing", () => {
    expect(diffDecision(base, base).hasChanges).toBe(false);
    expect(diffDecision(null, base).hasChanges).toBe(false);
    expect(diffDecision(base, null).hasChanges).toBe(false);
  });
});
