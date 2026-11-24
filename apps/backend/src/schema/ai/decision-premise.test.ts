import { describe, expect, it } from "vitest";
import {
  coerceDecisionPremise,
  isValidDecisionPremise,
} from "./decision-premise";

describe("decision premise", () => {
  it("accepts one or two words", () => {
    expect(isValidDecisionPremise("approve")).toBe(true);
    expect(isValidDecisionPremise("vendor approval")).toBe(true);
  });

  it("rejects empty, punctuation-only, and sentence premises", () => {
    expect(isValidDecisionPremise("   ")).toBe(false);
    expect(isValidDecisionPremise("Should this invoice be approved?")).toBe(
      false,
    );
  });

  it("keeps a valid optimizer candidate", () => {
    expect(coerceDecisionPremise("invoice_status", "approve")).toBe(
      "invoice_status",
    );
  });

  it("falls back to the current premise when the model returns a sentence", () => {
    expect(
      coerceDecisionPremise(
        "Should the invoice from this vendor be approved?",
        "approve",
      ),
    ).toBe("approve");
  });

  it("derives one word from a sentence when there is no valid current premise", () => {
    expect(
      coerceDecisionPremise("Should this invoice be approved?", null),
    ).toBe("approved");
  });
});
