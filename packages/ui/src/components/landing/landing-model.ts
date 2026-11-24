import type { StepStatus } from "#components/ui/chain-of-thought";
import type { PendingChoice } from "#components/userDecision/userChoiceBlock";
import type { FormEvent, KeyboardEventHandler, ReactNode } from "react";
import type { Control } from "react-hook-form";

/** The executor stores this on each step's `result` column. */
export interface StepResult {
  branch?:
    | "result"
    | "fallback"
    | "tool"
    | "none"
    | "true"
    | "false"
    | "awaiting_user";
  nextTaskId?: number | null;
  branchLabel?: string;
  summary?: string;
  note?: string;
  toolKey?: string | null;
  output?: unknown;
  outputType?: "normal" | "foreach";
  itemCount?: number;
  childQueuedTaskIds?: number[];
  answer?: unknown;
  effectiveAnswer?: unknown;
  model?: string | null;
  /** Set when the failed step was replaced by a retry. */
  retried?: boolean;
  retriedAt?: string;
}

export interface QueuedTaskStep {
  id: number;
  taskId: number | null;
  status: "queued" | "running" | "awaiting_input" | "completed" | "failed";
  runId: string;
  depth: number;
  result: StepResult | null;
  pendingChoice: PendingChoice | null;
  model: string | null;
  decisionModel: string | null;
  state: string | null;
  task: {
    id: number | null;
    name: string | null;
    type: string | null;
    toolKey?: string | null;
    toolConfig?: unknown;
  } | null;
}

export interface QueuedTaskRow {
  id: number | null;
  taskId: number | null;
  status:
    | "queued"
    | "running"
    | "awaiting_input"
    | "completed"
    | "failed"
    | null;
  runId: string | null;
  depth?: number | null;
  result: unknown;
  pendingChoice?: unknown;
  model: string | null;
  decisionModel: string | null;
  state: string | null;
  task: {
    id: number | null;
    name: string | null;
    type: string | null;
    toolKey?: string | null;
    toolConfig?: unknown;
  } | null;
}

export interface LandingTask {
  id: number | null;
  name: string | null;
}

export interface LandingRun {
  runId: string;
  state: string | null;
  steps: QueuedTaskStep[];
  startTaskId: number | null;
  pending: boolean;
  awaitingInput: boolean;
  failed: boolean;
  cancelled?: boolean;
}

export interface LandingFormInputs {
  taskId: string;
  state: string;
}

export interface LandingComposerState {
  control: Control<LandingFormInputs>;
  submit: (event?: FormEvent<HTMLFormElement>) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  attachments: File[];
  recording: boolean;
  isSubmitting: boolean;
  attachError: unknown;
  submitError: unknown;
  addFiles: (files: File[]) => void;
  removeAttachment: (index: number) => void;
  rejectDirectory: () => void;
  toggleRecording: () => void;
}

export interface LandingRunsState {
  runs: LandingRun[];
  openRuns: Record<string, boolean>;
  answeringStepId: number | null;
  dismissingStepId: number | null;
  retryingStepId: number | null;
  retryErrorStepId: number | null;
  answerError: string | null;
  dismissError: string | null;
  retryError: string | null;
  setRunOpen: (runId: string, open: boolean) => void;
  answerChoice: (stepId: number, optionId: string) => Promise<void>;
  dismissRun: (stepId: number) => Promise<void>;
  retryStep: (stepId: number) => Promise<void>;
}

export interface LandingComposerProps extends LandingComposerState {
  tasks: LandingTask[];
  autoEnabled: boolean;
  children: ReactNode;
}

export interface LandingRunsProps extends LandingRunsState {
  tasks: LandingTask[];
}

export function toStep(row: QueuedTaskRow): QueuedTaskStep | null {
  if (row.id == null || !row.runId) return null;

  return {
    id: row.id,
    taskId: row.taskId ?? null,
    status: row.status ?? "queued",
    runId: row.runId,
    depth: row.depth ?? 0,
    result: (row.result as StepResult | null) ?? null,
    pendingChoice: (row.pendingChoice as PendingChoice | null) ?? null,
    model: row.model ?? null,
    decisionModel: row.decisionModel ?? null,
    task: row.task ?? null,
    state: row.state ?? null,
  };
}

export function upsertStep(
  steps: QueuedTaskStep[],
  step: QueuedTaskStep,
): QueuedTaskStep[] {
  const index = steps.findIndex((candidate) => candidate.id === step.id);
  if (index === -1) return [...steps, step].sort((a, b) => a.id - b.id);

  const next = [...steps];
  next[index] = step;
  return next;
}

/** Falls back to the attached file names when the user writes no state. */
export function stateFromAttachments(attachments: File[]): string {
  if (attachments.length === 0) return "";
  if (attachments.length === 1) return `Process ${attachments[0]!.name}`;
  return `Process ${attachments.length} files`;
}

export function groupRuns(steps: QueuedTaskStep[]): LandingRun[] {
  const byRun = new Map<string, QueuedTaskStep[]>();

  for (const step of steps) {
    const runSteps = byRun.get(step.runId);
    if (runSteps) runSteps.push(step);
    else byRun.set(step.runId, [step]);
  }

  return [...byRun.entries()]
    .map(([runId, runSteps]) => {
      const ordered = [...runSteps].sort((a, b) => a.id - b.id);
      const root = ordered.find((step) => step.depth === 0) ?? ordered[0];

      return {
        runId,
        state: root?.state ?? null,
        steps: ordered,
        startTaskId: root?.taskId ?? null,
        pending: ordered.some(
          (step) =>
            step.status === "queued" ||
            step.status === "running" ||
            step.status === "awaiting_input",
        ),
        awaitingInput: ordered.some(
          (step) => step.status === "awaiting_input",
        ),
        failed: ordered.some(
          (step) => step.status === "failed" && step.result?.retried !== true,
        ),
      };
    })
    .sort((a, b) => (a.steps[0]?.id ?? 0) - (b.steps[0]?.id ?? 0));
}

export function taskNameById(
  tasks: LandingTask[],
  id: number | null | undefined,
): string | null {
  if (id == null) return null;
  return tasks.find((task) => task.id === id)?.name ?? `task ${id}`;
}

export function runHeaderStatus(
  run: LandingRun,
): "error" | "running" | undefined {
  if (run.failed) return "error";
  if (run.pending) return "running";
  return undefined;
}

export function runTitle(run: LandingRun, startName: string | null): string {
  const suffix = startName ? ` — ${startName}` : "";

  if (run.cancelled) return `Run stopped${suffix}`;
  if (run.failed) return `Run failed${suffix}`;
  if (run.awaitingInput) return `Waiting for your choice${suffix}`;
  if (run.pending) return `Working${startName ? ` on ${startName}` : ""}`;

  const stepCount = `Finished in ${run.steps.length} step${
    run.steps.length === 1 ? "" : "s"
  }`;

  return `${stepCount}${suffix}`;
}

export function stepStatus(step: QueuedTaskStep): StepStatus {
  if (step.status === "running" || step.status === "awaiting_input") {
    return "active";
  }
  if (step.status === "queued") return "pending";
  if (step.status === "failed") return "error";
  return "complete";
}

/** A short label for the branch the step took, if any. */
export function stepBranchLabel(
  step: QueuedTaskStep,
  nameForTask: (id: number) => string | null,
): string | undefined {
  const result = step.result;
  if (!result) return undefined;

  if (result.outputType === "foreach") {
    const count = `foreach × ${result.itemCount ?? 0}`;
    return result.nextTaskId != null
      ? `${count} → ${nameForTask(result.nextTaskId)}`
      : count;
  }

  const target = result.nextTaskId != null ? result.nextTaskId : null;

  switch (result.branch) {
    case "true":
      return target != null ? `true: ${nameForTask(target)}` : "true branch";
    case "false":
      return target != null ? `false: ${nameForTask(target)}` : "false branch";
    case "result":
      return `next: ${target != null ? nameForTask(target) : null}`;
    case "fallback":
      return `fallback: ${target != null ? nameForTask(target) : null}`;
    case "tool":
      if (target != null) {
        const prefix = result.branchLabel ? `${result.branchLabel}: ` : "next: ";
        return `${prefix}${nameForTask(target)}`;
      }
      return result.branchLabel ?? "tool result";
    case "awaiting_user":
      return "waiting for your choice";
    default:
      return undefined;
  }
}

/** Summary, note, and model names shown below the step title. */
export function stepDetail(step: QueuedTaskStep): string | undefined {
  return (
    [
      step.result?.summary,
      step.result?.note,
      step.result?.retried ? "retried" : null,
      step.model ? `generation: ${step.model}` : null,
      step.decisionModel ? `decision: ${step.decisionModel}` : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" — ") || undefined
  );
}
