import { isValidDecisionPremise } from "../../schema/ai/decision-premise";

export const REVISION_KINDS = [
  "updateToolConfig",
  "replaceTask",
  "insertBefore",
  "insertAfter",
  "insertBeforeAndAfter",
  "runNext",
] as const;

export type RevisionKind = (typeof REVISION_KINDS)[number];

export interface TaskDraftResult {
  option?: string | null;
  scoreThreshold?: number | null;
  probabilityThreshold?: number | null;
  confidenceThreshold?: number | null;
  resultTaskId?: number | null;
  appendState?: boolean;
}

export interface TaskDraftDecision {
  name?: string;
  type: "choice" | "score" | "noul";
  decisionPremise: string;
  instruction: string;
  options: string[];
  optionDescriptions?: string[];
  results?: TaskDraftResult[];
}

export interface TaskDraftUserDecisionOption {
  kind?: "static" | "dynamic";
  label?: string | null;
  description?: string | null;
  value?: string | null;
  selector?: Record<string, unknown> | null;
  labelPath?: string | null;
  descriptionPath?: string | null;
  valuePath?: string | null;
  resultTaskId?: number | null;
  appendState?: boolean;
  sortOrder?: number;
}

export interface TaskDraft {
  name: string;
  type: "tool" | "decision" | "userDecision";
  toolKey?: string | null;
  toolConfig?: Record<string, unknown> | null;
  toolOutputType?: "normal" | "foreach";
  onTrueTaskId?: number | null;
  onFalseTaskId?: number | null;
  fallbackTaskId?: number | null;
  model?: string | null;
  decisionModel?: string | null;
  decision?: TaskDraftDecision;
  results?: TaskDraftResult[];
  userDecisionType?: "yesNo" | "list" | "dropdown";
  userDecisionConfig?: Record<string, unknown> | null;
  userDecisionOptions?: TaskDraftUserDecisionOption[];
}

export interface RevisionProposal {
  kind: RevisionKind;
  explanation: string;
  confidence: number;
  taskPatch?: { toolConfig?: Record<string, unknown> };
  replacement?: TaskDraft;
  insertions?: TaskDraft[];
  nextTaskId?: number | null;
  warnings: string[];
}

export class RevisionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new RevisionValidationError(`${label} must be a list`);
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readResultDraft(value: unknown, label: string): TaskDraftResult {
  if (!isRecord(value)) {
    throw new RevisionValidationError(`${label} must be an object`);
  }
  return {
    option: typeof value.option === "string" ? value.option : null,
    scoreThreshold:
      typeof value.scoreThreshold === "number" ? value.scoreThreshold : null,
    probabilityThreshold:
      typeof value.probabilityThreshold === "number"
        ? value.probabilityThreshold
        : null,
    confidenceThreshold:
      typeof value.confidenceThreshold === "number"
        ? value.confidenceThreshold
        : null,
    resultTaskId:
      typeof value.resultTaskId === "number" ? value.resultTaskId : null,
    appendState: value.appendState === true,
  };
}

function readDecisionDraft(
  value: unknown,
  fallbackTaskId: number | null,
  label: string,
): TaskDraftDecision {
  if (!isRecord(value)) {
    throw new RevisionValidationError(`${label} needs a decision object`);
  }

  const type =
    value.type === "score" || value.type === "noul"
      ? value.type
      : ("choice" as const);
  const options = readStringList(value.options, `${label}.options`);
  if (options.length < 2) {
    throw new RevisionValidationError(
      `${label} needs at least two decision options`,
    );
  }

  const decisionPremise =
    typeof value.decisionPremise === "string"
      ? value.decisionPremise.trim()
      : "";
  const instruction =
    typeof value.instruction === "string" ? value.instruction.trim() : "";
  if (!decisionPremise) {
    throw new RevisionValidationError(`${label} needs a decision premise`);
  }
  if (!isValidDecisionPremise(decisionPremise)) {
    throw new RevisionValidationError(
      `${label} premise must be one word, or at most two`,
    );
  }
  if (!instruction) {
    throw new RevisionValidationError(`${label} needs an instruction`);
  }

  const descriptions = Array.isArray(value.optionDescriptions)
    ? value.optionDescriptions
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
    : [];

  const results = Array.isArray(value.results)
    ? value.results.map((entry, index) =>
        readResultDraft(entry, `${label}.results[${index}]`),
      )
    : options.map((option) => ({
        option,
        resultTaskId: fallbackTaskId,
        appendState: true,
      }));

  if (!results.some((result) => result.resultTaskId != null)) {
    throw new RevisionValidationError(
      `${label} needs at least one result wired to a next task`,
    );
  }

  return {
    name: typeof value.name === "string" ? value.name : undefined,
    type,
    decisionPremise,
    instruction,
    options,
    optionDescriptions: descriptions,
    results,
  };
}

function readUserDecisionOptionDraft(
  value: unknown,
  label: string,
): TaskDraftUserDecisionOption {
  if (!isRecord(value)) {
    throw new RevisionValidationError(`${label} must be an object`);
  }
  if (typeof value.label !== "string" && typeof value.value !== "string") {
    throw new RevisionValidationError(`${label} needs a label or value`);
  }

  return {
    kind: value.kind === "dynamic" ? "dynamic" : "static",
    label: typeof value.label === "string" ? value.label : null,
    description:
      typeof value.description === "string" ? value.description : null,
    value: typeof value.value === "string" ? value.value : null,
    selector: isRecord(value.selector) ? value.selector : null,
    labelPath: typeof value.labelPath === "string" ? value.labelPath : null,
    descriptionPath:
      typeof value.descriptionPath === "string" ? value.descriptionPath : null,
    valuePath: typeof value.valuePath === "string" ? value.valuePath : null,
    resultTaskId:
      typeof value.resultTaskId === "number" ? value.resultTaskId : null,
    appendState: value.appendState === true,
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : 0,
  };
}

function readDraft(value: unknown, label: string): TaskDraft {
  if (!isRecord(value)) {
    throw new RevisionValidationError(`${label} must be an object`);
  }

  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new RevisionValidationError(`${label} needs a name`);
  }

  const type = value.type;
  if (type !== "tool" && type !== "decision" && type !== "userDecision") {
    throw new RevisionValidationError(`${label} has an invalid type`);
  }

  if (type === "tool" && typeof value.toolKey !== "string") {
    throw new RevisionValidationError(`${label} needs a toolKey`);
  }

  const fallbackTaskId =
    typeof value.fallbackTaskId === "number" ? value.fallbackTaskId : null;
  const userDecisionType =
    value.userDecisionType === "yesNo" || value.userDecisionType === "dropdown"
      ? value.userDecisionType
      : "list";
  const userDecisionOptions = Array.isArray(value.userDecisionOptions)
    ? value.userDecisionOptions.map((entry, index) =>
        readUserDecisionOptionDraft(
          entry,
          `${label}.userDecisionOptions[${index}]`,
        ),
      )
    : [];

  if (
    type === "userDecision" &&
    userDecisionType !== "yesNo" &&
    userDecisionOptions.length < 1
  ) {
    throw new RevisionValidationError(
      `${label} needs at least one user-decision option`,
    );
  }

  return {
    name: value.name,
    type,
    toolKey: typeof value.toolKey === "string" ? value.toolKey : null,
    toolConfig: isRecord(value.toolConfig) ? value.toolConfig : null,
    toolOutputType:
      value.toolOutputType === "foreach" ? "foreach" : "normal",
    onTrueTaskId:
      typeof value.onTrueTaskId === "number" ? value.onTrueTaskId : null,
    onFalseTaskId:
      typeof value.onFalseTaskId === "number" ? value.onFalseTaskId : null,
    fallbackTaskId,
    model: typeof value.model === "string" ? value.model : null,
    decisionModel:
      typeof value.decisionModel === "string" ? value.decisionModel : null,
    decision:
      type === "decision"
        ? readDecisionDraft(value.decision, fallbackTaskId, `${label}.decision`)
        : undefined,
    results: Array.isArray(value.results)
      ? value.results.map((entry, index) =>
          readResultDraft(entry, `${label}.results[${index}]`),
        )
      : undefined,
    userDecisionType,
    userDecisionConfig: isRecord(value.userDecisionConfig)
      ? value.userDecisionConfig
      : null,
    userDecisionOptions,
  };
}

/** Validates a model proposal before it can ever be previewed or applied. */
export function validateRevisionProposal(
  value: unknown,
): RevisionProposal {
  if (!isRecord(value)) {
    throw new RevisionValidationError("Proposal must be an object");
  }

  const kind = value.kind;
  if (!REVISION_KINDS.includes(kind as RevisionKind)) {
    throw new RevisionValidationError(
      `Unknown revision kind "${String(kind)}"`,
    );
  }

  const explanation =
    typeof value.explanation === "string" ? value.explanation.trim() : "";
  if (!explanation) {
    throw new RevisionValidationError("Proposal needs an explanation");
  }

  const confidence =
    typeof value.confidence === "number" ? value.confidence : 0;
  if (confidence < 0 || confidence > 1) {
    throw new RevisionValidationError("Confidence must be between 0 and 1");
  }

  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];

  const proposal: RevisionProposal = {
    kind: kind as RevisionKind,
    explanation,
    confidence,
    warnings,
  };

  if (kind === "updateToolConfig") {
    const patch = isRecord(value.taskPatch) ? value.taskPatch : {};
    if (!isRecord(patch.toolConfig)) {
      throw new RevisionValidationError(
        "updateToolConfig needs taskPatch.toolConfig",
      );
    }
    proposal.taskPatch = { toolConfig: patch.toolConfig };
  }

  if (kind === "replaceTask") {
    proposal.replacement = readDraft(value.replacement, "replacement");
  }

  if (
    kind === "insertBefore" ||
    kind === "insertAfter" ||
    kind === "insertBeforeAndAfter"
  ) {
    if (!Array.isArray(value.insertions) || value.insertions.length === 0) {
      throw new RevisionValidationError("Proposal needs at least one insertion");
    }
    if (value.insertions.length > 2) {
      throw new RevisionValidationError("At most two insertions are allowed");
    }
    if (kind === "insertBeforeAndAfter" && value.insertions.length !== 2) {
      throw new RevisionValidationError(
        "insertBeforeAndAfter needs exactly two insertions: one before and one after",
      );
    }
    proposal.insertions = value.insertions.map((entry, index) =>
      readDraft(entry, `insertion ${index + 1}`),
    );
  }

  if (kind === "runNext" && typeof value.nextTaskId === "number") {
    proposal.nextTaskId = value.nextTaskId;
  }

  return proposal;
}
