export interface SnapshotDecision {
  id?: number;
  name?: string;
  type?: string;
  decisionPremise?: string;
  instruction?: string;
  options?: string[] | null;
  optionDescriptions?: string[] | null;
}

export interface AssistedAttempt {
  id: number;
  queuedTaskId: number;
  attemptNumber: number;
  kind: "initial" | "revision" | "replay";
  status: "running" | "succeeded" | "failed" | "cancelled" | "committed";
  taskSnapshot: {
    task?: { id: number; name: string; type: string; toolKey?: string | null };
    decision?: SnapshotDecision | null;
    results?: {
      id: number;
      type: string;
      option?: string | null;
      resultTaskId?: number | null;
      probabilityThreshold?: number | null;
      confidenceThreshold?: number | null;
      scoreThreshold?: number | null;
    }[];
    userDecisionOptions?: Record<string, unknown>[];
  } | null;
  beforeState: string;
  beforeToolState: unknown;
  afterState: string | null;
  afterToolState: unknown;
  result: Record<string, unknown> | null;
  effectJournal: unknown;
  revision: Record<string, unknown> | null;
  review: Record<string, unknown> | null;
  workspaceKey: string | null;
  createdAt: string;
  finishedAt: string | null;
  committedAt: string | null;
}

export interface AssistedStep {
  id: number;
  taskId: number;
  depth: number;
  status:
    | "queued"
    | "running"
    | "awaiting_input"
    | "waiting"
    | "completed"
    | "failed";
  state: string;
  result: Record<string, unknown> | null;
  pendingChoice: AssistedPendingChoice | null;
  task: { id: number; name: string; type: string } | null;
  attempts: AssistedAttempt[];
  currentAttempt: AssistedAttempt | null;
}

export interface AssistedPendingChoice {
  kind: string;
  taskId: number;
  prompt: string;
  acceptLabel: string;
  recommendedOptionId?: string | null;
  createdAt?: string;
  options: {
    id: string;
    label: string;
    description?: string;
    value?: unknown;
    resultTaskId?: number | null;
  }[];
}

/** A task that can be wired as a decision option's next step. */
export interface TargetTaskOption {
  id: number;
  name: string;
  type: string;
}

/** A model-drafted tool task for a decision option that has no target yet. */
export interface NextTaskDraft {
  name: string;
  explanation?: string;
  type: "tool";
  toolKey: string;
  toolConfig: Record<string, unknown>;
  toolOutputType?: "normal" | "foreach";
}

export interface AssistedRun {
  id: string;
  status:
    | "running"
    | "awaiting_step_review"
    | "awaiting_decision_review"
    | "awaiting_user_choice"
    | "completed"
    | "cancelled"
    | "failed";
  mode: string;
  state: string;
  startTaskId: number | null;
  createdAt: string;
  updatedAt: string;
  steps: AssistedStep[];
  attempts: AssistedAttempt[];
}

export interface TraceEventRow {
  id: number;
  attemptId: number | null;
  sequence: number;
  kind: string;
  payload: unknown;
  createdAt: string;
}

export interface RevisionProposal {
  kind: string;
  explanation: string;
  confidence: number;
  taskPatch?: { toolConfig?: Record<string, unknown> };
  replacement?: Record<string, unknown>;
  insertions?: Record<string, unknown>[];
  nextTaskId?: number | null;
  warnings: string[];
}
