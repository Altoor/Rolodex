import type {
  DecisionType,
  GetTaskQuery,
  TaskType,
  ToolOutputType,
} from "@repo/queries/__generated__/graphql";

export type TaskResultFormValues = {
  id: number | null;
  type: DecisionType;
  taskId: number | null;
  scoreThreshold: number | null;
  resultTaskId: number | null;
  confidenceThreshold: number | null;
  option: string | null;
  probabilityThreshold: number | null;
};

export type TaskDecisionFormValue = {
  id: number;
  type: DecisionType;
  options: string[];
};

export type TaskFormValues = {
  name: string;
  type: TaskType;
  taskResults: TaskResultFormValues[];
  decision: TaskDecisionFormValue | null;
  toolKey: string | null;
  toolConfigText: string;
  toolOutputType: ToolOutputType;
  onTrueTaskId: string;
  onFalseTaskId: string;
  model: string | null;
  decisionModel: string | null;
};

export const USE_USER_DEFAULT_MODEL = "__user_default_model__";
export const NO_BRANCH_TASK = "__none__";

export const emptyTaskFormValues: TaskFormValues = {
  name: "",
  type: "decision",
  taskResults: [],
  decision: null,
  toolKey: null,
  toolConfigText: "",
  toolOutputType: "normal",
  onTrueTaskId: NO_BRANCH_TASK,
  onFalseTaskId: NO_BRANCH_TASK,
  model: null,
  decisionModel: null,
};

type TaskRecord = NonNullable<GetTaskQuery["getTask"]>;

export const taskToFormValues = (task: TaskRecord): TaskFormValues => ({
  name: task.name ?? "",
  type: (task.type as TaskType | null) ?? "decision",
  taskResults: (task.taskResults ?? [])
    .filter((result) => result != null)
    .map((result) => ({
      id: result.id,
      type: (result.type as DecisionType | null) ?? "noul",
      taskId: result.taskId,
      scoreThreshold: result.scoreThreshold,
      resultTaskId: result.resultTaskId,
      confidenceThreshold: result.confidenceThreshold,
      option: result.option,
      probabilityThreshold: result.probabilityThreshold,
    })),
  decision: task.decision
    ? {
        id: task.decision.id ?? task.id ?? 0,
        type: (task.decision.type as DecisionType | null) ?? "noul",
        options: task.decision.options ?? [],
      }
    : null,
  toolKey: task.toolKey ?? null,
  toolConfigText: task.toolConfig
    ? JSON.stringify(task.toolConfig, null, 2)
    : "",
  toolOutputType: (task.toolOutputType as ToolOutputType | null) ?? "normal",
  onTrueTaskId:
    task.onTrueTaskId != null ? String(task.onTrueTaskId) : NO_BRANCH_TASK,
  onFalseTaskId:
    task.onFalseTaskId != null ? String(task.onFalseTaskId) : NO_BRANCH_TASK,
  model: task.model ?? null,
  decisionModel: task.decisionModel ?? null,
});
