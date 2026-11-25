import type { SnapshotDecision } from "../types";

export interface DecisionTextFieldChange {
  field: "premise" | "instruction";
  label: string;
  before: string;
  after: string;
}

export interface DecisionOptionChange {
  kind: "added" | "removed" | "description";
  option: string;
  before?: string;
  after?: string;
}

export interface DecisionDiff {
  fields: DecisionTextFieldChange[];
  options: DecisionOptionChange[];
  hasChanges: boolean;
}

const EMPTY: DecisionDiff = { fields: [], options: [], hasChanges: false };

function descriptionFor(
  decision: SnapshotDecision,
  option: string,
): string {
  const index = (decision.options ?? []).indexOf(option);
  return index >= 0 ? (decision.optionDescriptions?.[index] ?? "") : "";
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Compares the decision definition before and after a revision so the review
 * panel can show exactly which wording changed. A revision may also touch the
 * task or tool config; this helper only covers the decision itself.
 */
export function diffDecision(
  previous: SnapshotDecision | null | undefined,
  current: SnapshotDecision | null | undefined,
): DecisionDiff {
  if (!previous || !current) return EMPTY;

  const fields: DecisionTextFieldChange[] = [];

  const previousPremise = text(previous.decisionPremise);
  const currentPremise = text(current.decisionPremise);
  if (previousPremise !== currentPremise) {
    fields.push({
      field: "premise",
      label: "Decision premise",
      before: previousPremise,
      after: currentPremise,
    });
  }

  const previousInstruction = text(previous.instruction);
  const currentInstruction = text(current.instruction);
  if (previousInstruction !== currentInstruction) {
    fields.push({
      field: "instruction",
      label: "Instruction",
      before: previousInstruction,
      after: currentInstruction,
    });
  }

  const previousOptions = previous.options ?? [];
  const currentOptions = current.options ?? [];
  const options: DecisionOptionChange[] = [];

  for (const option of currentOptions) {
    if (!previousOptions.includes(option)) {
      options.push({ kind: "added", option });
      continue;
    }
    const before = descriptionFor(previous, option).trim();
    const after = descriptionFor(current, option).trim();
    if (before !== after) {
      options.push({ kind: "description", option, before, after });
    }
  }

  for (const option of previousOptions) {
    if (!currentOptions.includes(option)) {
      options.push({ kind: "removed", option });
    }
  }

  return {
    fields,
    options,
    hasChanges: fields.length > 0 || options.length > 0,
  };
}
