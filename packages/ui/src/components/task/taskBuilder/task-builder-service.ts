import type {
  GetModelsQuery,
  GetTasksQuery,
} from "@repo/queries/__generated__/graphql";
import {
  NO_BRANCH_TASK,
  USE_USER_DEFAULT_MODEL,
  type TaskFormValues,
  type TaskResultFormValues,
} from "../task-form";

export interface BranchTaskOption {
  id: number;
  name: string;
}

export const parseBranchTaskId = (value: string): number | null => {
  if (!value || value === NO_BRANCH_TASK) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Parses the optional toolConfig textarea. Throws on invalid JSON. */
export function parseToolConfigText(
  text: string,
): Record<string, unknown> | null {
  if (!text.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err), {
      cause: err,
    });
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("toolConfig must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}

/** Builds the create/update task mutation variables from form values. */
export function buildTaskVariables(
  values: TaskFormValues,
  selectedDecisionId: number | undefined,
) {
  const isIfTool = values.type === "tool" && values.toolKey === "if";

  return {
    name: values.name,
    type: values.type,
    decisionId: values.type === "decision" ? selectedDecisionId : undefined,
    toolKey: values.type === "tool" ? values.toolKey : null,
    toolConfig: parseToolConfigText(
      values.type === "tool" ? values.toolConfigText : "",
    ),
    toolOutputType:
      values.type === "tool" ? values.toolOutputType : ("normal" as const),
    onTrueTaskId: isIfTool ? parseBranchTaskId(values.onTrueTaskId) : null,
    onFalseTaskId: isIfTool ? parseBranchTaskId(values.onFalseTaskId) : null,
    model: values.model === USE_USER_DEFAULT_MODEL ? null : values.model,
    decisionModel:
      values.decisionModel === USE_USER_DEFAULT_MODEL
        ? null
        : values.decisionModel,
  };
}

/** Builds the create/update TaskResult mutation variables. */
export function buildTaskResultVariables(
  result: TaskResultFormValues,
  taskId: number,
) {
  return {
    type: result.type,
    taskId,
    confidenceThreshold: result.confidenceThreshold ?? null,
    probabilityThreshold: result.probabilityThreshold ?? null,
    scoreThreshold: result.scoreThreshold ?? null,
    resultTaskId: result.resultTaskId ?? null,
    option: result.option ?? null,
  };
}

export function toBranchTaskOptions(
  tasks: GetTasksQuery["tasks"] | undefined,
): BranchTaskOption[] {
  return (tasks ?? []).flatMap((task) =>
    task?.id != null
      ? [{ id: task.id, name: task.name ?? "Untitled task" }]
      : [],
  );
}

export function toModelNames(
  models: GetModelsQuery["models"] | undefined,
): string[] {
  return (models ?? []).flatMap((model) =>
    model.pulled && model.name ? [model.name] : [],
  );
}
