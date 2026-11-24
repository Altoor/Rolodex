import {
  USE_USER_DEFAULT_MODEL,
  type TaskFormValues,
} from "../task-form";
import {
  parseBranchTaskId,
  parseSelectorText,
  parseToolConfigText,
} from "./task-builder-service";

/**
 * The executable snapshot the backend needs to start an assisted run from the
 * current builder draft. It mirrors the step snapshot shape (`task`, `decision`,
 * `results`, `userDecisionOptions`) so unsaved edits run exactly as shown.
 */
export interface BuilderTaskSnapshot {
  task: Record<string, unknown>;
  decision: Record<string, unknown> | null;
  results: Record<string, unknown>[];
  userDecisionOptions: Record<string, unknown>[];
}

export function buildTaskSnapshot(
  values: TaskFormValues,
  selectedDecisionId?: number,
): BuilderTaskSnapshot {
  const isIfTool = values.type === "tool" && values.toolKey === "if";

  return {
    task: {
      name: values.name,
      type: values.type,
      decisionId: values.type === "decision" ? (selectedDecisionId ?? null) : null,
      toolKey: values.type === "tool" ? values.toolKey : null,
      toolConfig:
        values.type === "tool"
          ? parseToolConfigText(values.toolConfigText)
          : null,
      toolOutputType:
        values.type === "tool" ? values.toolOutputType : "normal",
      onTrueTaskId: isIfTool ? parseBranchTaskId(values.onTrueTaskId) : null,
      onFalseTaskId: isIfTool ? parseBranchTaskId(values.onFalseTaskId) : null,
      model: values.model === USE_USER_DEFAULT_MODEL ? null : values.model,
      decisionModel:
        values.decisionModel === USE_USER_DEFAULT_MODEL
          ? null
          : values.decisionModel,
      decisionStateConfig:
        values.type === "decision"
          ? {
              mode: values.decisionStateMode,
              paths: values.decisionStatePaths
                .map((entry) => entry.path.trim())
                .filter(Boolean),
            }
          : null,
      forceUserDecideIfNoMatch:
        values.type === "decision"
          ? values.forceUserDecideIfNoMatch
          : undefined,
      userDecisionType:
        values.type === "userDecision" ? values.userDecisionType : null,
      userDecisionConfig:
        values.type === "userDecision" ? values.userDecisionConfig : null,
      canRunInParallel: values.canRunInParallel,
      prioritize: values.prioritize,
    },
    decision: values.decision
      ? {
          id: values.decision.id,
          type: values.decision.type,
          options: values.decision.options,
        }
      : null,
    results: values.taskResults.map((result) => ({
      id: result.id,
      type: result.type,
      option: result.option,
      scoreThreshold: result.scoreThreshold,
      probabilityThreshold: result.probabilityThreshold,
      confidenceThreshold: result.confidenceThreshold,
      resultTaskId: result.resultTaskId,
      appendState: false,
    })),
    userDecisionOptions: values.userDecisionOptions.map((option) => ({
      id: option.id,
      kind: option.kind,
      label: option.kind === "static" ? option.label || option.value : null,
      description: option.description || null,
      value: option.value || null,
      selector:
        option.kind === "dynamic"
          ? parseSelectorText(option.selectorText)
          : null,
      labelPath: option.labelPath || null,
      descriptionPath: option.descriptionPath || null,
      valuePath: option.valuePath || null,
      resultTaskId: option.resultTaskId ?? null,
      appendState: option.appendState,
      sortOrder: Number.isFinite(option.sortOrder) ? option.sortOrder : 0,
    })),
  };
}
