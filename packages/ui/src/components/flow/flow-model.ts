export type FlowStartKind =
  | "existingTask"
  | "newToolTask"
  | "newDecisionTask"
  | "newUserDecisionTask";

export interface FlowStartCandidate {
  key: string;
  kind: FlowStartKind;
  taskId: number | null;
  label: string;
  description: string;
  confidence: number | null;
}

export interface FlowStartProposal {
  candidates: FlowStartCandidate[];
  recommendedKey: string;
  reason: string;
  model: string | null;
}

export interface FlowDecisionOptionDraft {
  name: string;
  description: string;
}

export interface FlowDecisionResultDraft {
  option: string | null;
  targetTaskId: number | null;
  scoreThreshold: number | null;
  probabilityThreshold: number | null;
  confidenceThreshold: number | null;
}

export interface FlowDecisionDraft {
  name: string;
  type: "choice" | "noul" | "score";
  decisionPremise: string;
  instruction: string;
  options: FlowDecisionOptionDraft[];
  results: FlowDecisionResultDraft[];
}

export interface FlowUserDecisionOptionDraft {
  label: string;
  description: string | null;
  value: string;
  resultTaskId: number | null;
}

export interface FlowUserDecisionDraft {
  choiceType: "yesNo" | "list" | "dropdown";
  prompt: string;
  acceptLabel: string;
  options: FlowUserDecisionOptionDraft[];
}

export interface FlowTaskDraft {
  kind: FlowStartKind;
  name: string;
  type: "tool" | "decision" | "userDecision";
  toolKey: string | null;
  toolConfig: Record<string, unknown> | null;
  toolOutputType: "normal" | "foreach";
  /** Task that runs after this tool, or null when the flow ends here. */
  fallbackTaskId: number | null;
  decision: FlowDecisionDraft | null;
  userDecision: FlowUserDecisionDraft | null;
  warnings: string[];
  model: string | null;
}

export interface FlowCandidateTask {
  id: number | null;
  name: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export function flowKindLabel(kind: FlowStartKind): string {
  switch (kind) {
    case "existingTask":
      return "Existing task";
    case "newToolTask":
      return "New tool task";
    case "newDecisionTask":
      return "New decision task";
    case "newUserDecisionTask":
      return "New user decision task";
  }
}

export function isNewKind(kind: FlowStartKind): boolean {
  return kind !== "existingTask";
}

export function toFlowStartProposal(value: unknown): FlowStartProposal | null {
  const record = asRecord(value);
  if (!record) return null;

  const candidates = asArray(record.candidates).flatMap((entry) => {
    const candidate = asRecord(entry);
    const key = asString(candidate?.key);
    const kind = asString(candidate?.kind) as FlowStartKind;
    if (!candidate || !key || !kind) return [];

    return [
      {
        key,
        kind,
        taskId: asInt(candidate.taskId),
        label: asString(candidate.label),
        description: asString(candidate.description),
        confidence: asNumber(candidate.confidence),
      },
    ];
  });

  if (candidates.length === 0) return null;

  return {
    candidates,
    recommendedKey: asString(record.recommendedKey, candidates[0]!.key),
    reason: asString(record.reason),
    model: asNullableString(record.model),
  };
}

function toDecisionDraft(value: unknown): FlowDecisionDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  const rawType = asString(record.type, "choice");
  const type: FlowDecisionDraft["type"] =
    rawType === "noul" || rawType === "score" ? rawType : "choice";

  return {
    name: asString(record.name),
    type,
    decisionPremise: asString(record.decisionPremise),
    instruction: asString(record.instruction),
    options: asArray(record.options).flatMap((entry) => {
      const option = asRecord(entry);
      const name = asString(option?.name);
      if (!option || !name) return [];
      return [{ name, description: asString(option.description) }];
    }),
    results: asArray(record.results).flatMap((entry) => {
      const result = asRecord(entry);
      if (!result) return [];
      return [
        {
          option: asNullableString(result.option),
          targetTaskId: asInt(result.targetTaskId),
          scoreThreshold: asNumber(result.scoreThreshold),
          probabilityThreshold: asNumber(result.probabilityThreshold),
          confidenceThreshold: asNumber(result.confidenceThreshold),
        },
      ];
    }),
  };
}

function toUserDecisionDraft(value: unknown): FlowUserDecisionDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  const rawType = asString(record.choiceType, "list");
  const choiceType: FlowUserDecisionDraft["choiceType"] =
    rawType === "yesNo" || rawType === "dropdown" ? rawType : "list";

  return {
    choiceType,
    prompt: asString(record.prompt),
    acceptLabel: asString(record.acceptLabel, "Accept"),
    options: asArray(record.options).flatMap((entry) => {
      const option = asRecord(entry);
      const label = asString(option?.label);
      if (!option || !label) return [];
      return [
        {
          label,
          description: asNullableString(option.description),
          value: asString(
            option.value,
            label.toLowerCase().replace(/\s+/g, "-"),
          ),
          resultTaskId: asInt(option.resultTaskId),
        },
      ];
    }),
  };
}

export function toFlowTaskDraft(value: unknown): FlowTaskDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  const kind = asString(record.kind) as FlowStartKind;
  const type = asString(record.type);
  if (!kind || (type !== "tool" && type !== "decision" && type !== "userDecision")) {
    return null;
  }

  return {
    kind,
    name: asString(record.name, "New task"),
    type,
    toolKey: asNullableString(record.toolKey),
    toolConfig: asRecord(record.toolConfig),
    toolOutputType:
      asString(record.toolOutputType) === "foreach" ? "foreach" : "normal",
    fallbackTaskId: asInt(record.fallbackTaskId),
    decision: toDecisionDraft(record.decision),
    userDecision: toUserDecisionDraft(record.userDecision),
    warnings: asArray(record.warnings).flatMap((warning) =>
      typeof warning === "string" ? [warning] : [],
    ),
    model: asNullableString(record.model),
  };
}

export function isDraftRunnable(draft: FlowTaskDraft): boolean {
  if (draft.type === "tool") return draft.toolKey != null;
  if (draft.type === "decision") {
    return (
      draft.decision != null &&
      draft.decision.results.some((result) => result.targetTaskId != null)
    );
  }
  return (draft.userDecision?.options.length ?? 0) > 0;
}
