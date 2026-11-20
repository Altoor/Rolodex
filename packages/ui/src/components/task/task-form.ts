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

export type UserDecisionType = "yesNo" | "list" | "dropdown";
export type UserDecisionOptionKind = "static" | "dynamic";
export type DecisionStateMode = "none" | "all" | "paths";

export type DecisionStatePathFormValue = {
  path: string;
};

export type UserDecisionOptionFormValues = {
  id: number | null;
  kind: UserDecisionOptionKind;
  label: string;
  description: string;
  value: string;
  selectorText: string;
  labelPath: string;
  descriptionPath: string;
  valuePath: string;
  resultTaskId: number | null;
  appendState: boolean;
  sortOrder: number;
};

export type UserDecisionConfigFormValues = {
  prompt: string;
  acceptLabel: string;
  yesLabel: string;
  noLabel: string;
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
  decisionStateMode: DecisionStateMode;
  decisionStatePaths: DecisionStatePathFormValue[];
  forceUserDecideIfNoMatch: boolean;
  userDecisionType: UserDecisionType;
  userDecisionConfig: UserDecisionConfigFormValues;
  userDecisionOptions: UserDecisionOptionFormValues[];
  canRunInParallel: boolean;
  prioritize: boolean;
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
  decisionStateMode: "none",
  decisionStatePaths: [],
  forceUserDecideIfNoMatch: true,
  userDecisionType: "list",
  userDecisionConfig: {
    prompt: "",
    acceptLabel: "Accept",
    yesLabel: "Yes",
    noLabel: "No",
  },
  userDecisionOptions: [],
  canRunInParallel: false,
  prioritize: false,
};

type TaskRecord = NonNullable<GetTaskQuery["getTask"]>;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const isDecisionStateMode = (value: unknown): value is DecisionStateMode =>
  value === "none" || value === "all" || value === "paths";

const parseDecisionStateConfig = (
  value: unknown,
): { mode: DecisionStateMode; paths: string[] } => {
  const config = asRecord(value);
  const mode = isDecisionStateMode(config.mode) ? config.mode : "none";
  const paths = Array.isArray(config.paths)
    ? config.paths.filter((path): path is string => typeof path === "string")
    : [];

  return { mode, paths };
};

export const taskToFormValues = (task: TaskRecord): TaskFormValues => {
  const userDecisionConfig = asRecord(task.userDecisionConfig);
  const decisionState = parseDecisionStateConfig(task.decisionStateConfig);

  return {
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
    decisionStateMode: decisionState.mode,
    decisionStatePaths: decisionState.paths.map((path) => ({ path })),
    forceUserDecideIfNoMatch: task.forceUserDecideIfNoMatch ?? true,
    userDecisionType:
      (task.userDecisionType as UserDecisionType | null) ?? "list",
    userDecisionConfig: {
      prompt: asString(userDecisionConfig.prompt),
      acceptLabel: asString(userDecisionConfig.acceptLabel, "Accept"),
      yesLabel: asString(userDecisionConfig.yesLabel, "Yes"),
      noLabel: asString(userDecisionConfig.noLabel, "No"),
    },
    userDecisionOptions: (task.userDecisionOptions ?? [])
      .filter((option) => option != null)
      .map((option) => ({
        id: option.id,
        kind: (option.kind as UserDecisionOptionKind | null) ?? "static",
        label: option.label ?? "",
        description: option.description ?? "",
        value: option.value ?? "",
        selectorText: option.selector
          ? JSON.stringify(option.selector, null, 2)
          : "",
        labelPath: option.labelPath ?? "",
        descriptionPath: option.descriptionPath ?? "",
        valuePath: option.valuePath ?? "",
        resultTaskId: option.resultTaskId,
        appendState: option.appendState ?? false,
        sortOrder: option.sortOrder ?? 0,
      })),
    canRunInParallel: task.canRunInParallel ?? true,
    prioritize: task.prioritize ?? false,
  };
};
