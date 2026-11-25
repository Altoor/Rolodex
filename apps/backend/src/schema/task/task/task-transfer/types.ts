export const FORMAT = "rolodex-tasks";
export const VERSION = 1;

export const TASK_TYPES = [
  "decision",
  "textPrompt",
  "tool",
  "userDecision",
] as const;
export const OUTPUT_TYPES = ["normal", "foreach"] as const;
export const DECISION_TYPES = ["choice", "noul", "score"] as const;
export const USER_DECISION_TYPES = ["yesNo", "list", "dropdown"] as const;
export const OPTION_KINDS = ["static", "dynamic"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type OutputType = (typeof OUTPUT_TYPES)[number];
export type DecisionType = (typeof DECISION_TYPES)[number];
export type UserDecisionType = (typeof USER_DECISION_TYPES)[number];
export type OptionKind = (typeof OPTION_KINDS)[number];

export interface TaskExportFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  decisions: ExportDecision[];
  tasks: ExportTask[];
}

export interface ExportDecision {
  id: number;
  name: string;
  type: DecisionType;
  decisionPremise: string;
  instruction: string;
  options: string[] | null;
  optionDescriptions: string[] | null;
}

export interface ExportTaskResult {
  type: DecisionType;
  option: string | null;
  scoreThreshold: number | null;
  probabilityThreshold: number | null;
  confidenceThreshold: number | null;
  resultTaskId: number | null;
  appendState: boolean;
}

export interface ExportUserDecisionOption {
  kind: OptionKind;
  label: string | null;
  description: string | null;
  value: string | null;
  selector: unknown;
  labelPath: string | null;
  descriptionPath: string | null;
  valuePath: string | null;
  resultTaskId: number | null;
  appendState: boolean;
  sortOrder: number;
}

export interface ExportTask {
  id: number;
  name: string;
  type: TaskType;
  decisionId: number | null;
  fallbackTaskId: number | null;
  toolKey: string | null;
  toolConfig: unknown;
  toolOutputType: OutputType;
  onTrueTaskId: number | null;
  onFalseTaskId: number | null;
  joinTaskId: number | null;
  model: string | null;
  decisionModel: string | null;
  decisionStateConfig: unknown;
  forceUserDecideIfNoMatch: boolean;
  canRunInParallel: boolean;
  prioritize: boolean;
  userDecisionType: UserDecisionType;
  userDecisionConfig: unknown;
  taskResults: ExportTaskResult[];
  userDecisionOptions: ExportUserDecisionOption[];
}

export interface ImportTasksResult {
  tasksCreated: number;
  decisionsCreated: number;
  /** New ids for the imported tasks, in the same order as the file. */
  taskIds: number[];
  warnings: string[];
}

export interface ImportTasksOptions {
  /**
   * Reuse decisions that already exist and keep references to existing tasks
   * outside the file. Used for copying tasks inside the same workspace.
   */
  reuseExisting?: boolean;
}

export function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}
