"use client";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  type StepStatus,
} from "#components/ui/chain-of-thought";
import { FieldDescription } from "#components/ui/field";
import { Circle, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { UserChoiceReview } from "../molecules/user-choice-review";
import { StepReviewPanel } from "./step-review-panel";
import type {
  AssistedRun,
  AssistedStep,
  NextTaskDraft,
  RevisionProposal,
} from "../types";

interface AssistedRunTimelineProps {
  run: AssistedRun;
  busy: string | null;
  proposal: RevisionProposal | null;
  actionError: string | null;
  onAccept: (attemptId: number) => void;
  onRequestRevision: (attemptId: number, feedback: string) => void;
  onApplyRevision: (attemptId: number, proposal: RevisionProposal) => void;
  onOverrideDecision: (attemptId: number, resultId: number) => void;
  onOptimizeDecision: (
    attemptId: number,
    expectedResultId: number,
    feedback?: string,
  ) => void;
  onEditDecisionWording: (
    attemptId: number,
    input: {
      decisionPremise: string;
      instruction: string;
      optionDescriptions?: string[];
    },
  ) => void;
  onAddDecisionOption: (
    attemptId: number,
    option: {
      label: string;
      description?: string;
      value?: string;
      targetTaskId?: number | null;
    },
  ) => void;
  onDraftDecisionTarget: (
    attemptId: number,
    feedback?: string,
    draft?: NextTaskDraft,
  ) => Promise<NextTaskDraft | null>;
  onWireDecisionTarget: (
    attemptId: number,
    resultId: number,
    targetTaskId: number,
  ) => void;
  onCreateDecisionTarget: (
    attemptId: number,
    resultId: number,
    draft: NextTaskDraft,
  ) => void;
  onSaveUserDecisionOptions?: (
    attemptId: number,
    options: {
      id: number;
      label?: string;
      description?: string;
      value?: string;
    }[],
  ) => void;
  onCancel: () => void;
  onAnswerUserChoice?: (stepId: number, optionId: string) => void;
}

function stepStatus(step: AssistedStep): StepStatus {
  if (step.status === "running" || step.status === "awaiting_input") {
    return "active";
  }
  if (step.status === "queued") return "pending";
  if (step.status === "failed") return "error";
  return "complete";
}

function statusIcon(status: StepStatus) {
  if (status === "active") return <LoaderCircle className="animate-spin" />;
  if (status === "error") return <CircleAlert />;
  if (status === "complete") return <CircleCheck />;
  return <Circle />;
}

function AttemptReview({
  runId,
  step,
  busy,
  proposal,
  onAccept,
  onRequestRevision,
  onApplyRevision,
  onOverrideDecision,
  onOptimizeDecision,
  onEditDecisionWording,
  onAddDecisionOption,
  onDraftDecisionTarget,
  onWireDecisionTarget,
  onCreateDecisionTarget,
  onSaveUserDecisionOptions,
  onCancel,
  onAnswerUserChoice,
}: Omit<AssistedRunTimelineProps, "run"> & { runId: string; step: AssistedStep }) {
  const attempt =
    step.currentAttempt ??
    [...step.attempts].sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ??
    null;

  const pending = step.pendingChoice;

  if (pending?.kind === "userDecision" && onAnswerUserChoice) {
    return (
      <UserChoiceReview
        key={pending.createdAt ?? step.id}
        step={step}
        attemptId={attempt?.id ?? null}
        busy={busy}
        onAnswer={onAnswerUserChoice}
        onSave={
          onSaveUserDecisionOptions
            ? (attemptId, options) =>
                onSaveUserDecisionOptions(attemptId, options)
            : undefined
        }
      />
    );
  }

  if (step.status !== "awaiting_input" || !attempt) return null;

  return (
    <StepReviewPanel
      runId={runId}
      step={step}
      attempt={attempt}
      busy={busy}
      proposal={proposal}
      onAccept={onAccept}
      onRequestRevision={onRequestRevision}
      onApplyRevision={onApplyRevision}
      onOverrideDecision={onOverrideDecision}
      onOptimizeDecision={onOptimizeDecision}
      onEditDecisionWording={onEditDecisionWording}
      onAddDecisionOption={onAddDecisionOption}
      onDraftDecisionTarget={onDraftDecisionTarget}
      onWireDecisionTarget={onWireDecisionTarget}
      onCreateDecisionTarget={onCreateDecisionTarget}
      onCancel={onCancel}
    />
  );
}

/** One assisted run rendered as a reviewable chain of thought. */
export function AssistedRunTimeline({
  run,
  actionError,
  ...actions
}: AssistedRunTimelineProps) {
  const running = run.status.startsWith("awaiting") || run.status === "running";

  return (
    <div className="flex flex-col gap-1">
      <FieldDescription className="text-xs">{run.state}</FieldDescription>
      <ChainOfThought defaultOpen>
        <ChainOfThoughtHeader
          status={
            run.status === "failed"
              ? "error"
              : running
                ? "running"
                : undefined
          }
          icon={
            run.status === "failed" ? (
              <CircleAlert />
            ) : running ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CircleCheck />
            )
          }
          title={`Assisted run · ${run.status.replaceAll("_", " ")}`}
        />
        <ChainOfThoughtContent>
          {run.steps.map((step) => {
            const status = stepStatus(step);
            const summary =
              typeof step.result?.summary === "string"
                ? step.result.summary
                : undefined;
            const failureNote =
              step.status === "failed" &&
              typeof step.result?.note === "string"
                ? step.result.note
                : null;

            return (
              <div key={step.id} className="flex flex-col gap-1">
                <ChainOfThoughtStep
                  status={status}
                  icon={statusIcon(status)}
                  title={step.task?.name ?? `task ${step.taskId}`}
                  description={summary}
                />
                {failureNote ? (
                  <FieldDescription className="ml-6 text-xs text-destructive">
                    {failureNote}
                  </FieldDescription>
                ) : null}
                <AttemptReview
                  runId={run.id}
                  step={step}
                  actionError={null}
                  {...actions}
                />
              </div>
            );
          })}
        </ChainOfThoughtContent>
      </ChainOfThought>
      {actionError ? (
        <FieldDescription
          role="alert"
          aria-live="polite"
          className="text-xs text-destructive"
        >
          {actionError}
        </FieldDescription>
      ) : null}
    </div>
  );
}
