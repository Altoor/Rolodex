"use client";

import { Square } from "lucide-react";
import { Button } from "#components/ui/button";
import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { AttemptSummary } from "../molecules/attempt-summary";
import { DecisionChanges } from "../molecules/decision-changes";
import { DecisionReview } from "../molecules/decision-review";
import { RevisionProposalEditor } from "../molecules/revision-proposal-editor";
import { ToolReview } from "../molecules/tool-review";
import { DecisionTargetWiringContainer } from "../containers/decision-target-wiring-container";
import type {
  AssistedAttempt,
  AssistedStep,
  NextTaskDraft,
  RevisionProposal,
} from "../types";

interface StepReviewPanelProps {
  runId: string;
  step: AssistedStep;
  attempt: AssistedAttempt | null;
  busy: string | null;
  proposal: RevisionProposal | null;
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
  onCancel: () => void;
}

/** Outcome review for tool and decision steps. */
export function StepReviewPanel({
  runId,
  step,
  attempt,
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
  onCancel,
}: StepReviewPanelProps) {
  if (!attempt) {
    return (
      <FieldDescription className="ml-6 text-xs">
        Waiting for an attempt…
      </FieldDescription>
    );
  }

  const decisionReview = step.pendingChoice?.kind === "assistedDecisionReview";
  const decisionTarget = step.pendingChoice?.kind === "assistedDecisionTarget";

  const previousAttempt =
    [...step.attempts]
      .filter((entry) => entry.attemptNumber < attempt.attemptNumber)
      .sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null;
  const decisionChanged =
    attempt.kind === "revision" && attempt.taskSnapshot?.decision != null;

  return (
    <div className="mt-2 ml-6 flex flex-col gap-3 self-stretch">
      <AttemptSummary runId={runId} attempt={attempt} />

      {decisionChanged ? (
        <DecisionChanges
          previous={previousAttempt?.taskSnapshot?.decision}
          current={attempt.taskSnapshot?.decision}
          revision={attempt.revision}
        />
      ) : null}

      {decisionTarget ? (
        <DecisionTargetWiringContainer
          step={step}
          attempt={attempt}
          busy={busy}
          onDraft={onDraftDecisionTarget}
          onWire={onWireDecisionTarget}
          onCreate={onCreateDecisionTarget}
        />
      ) : decisionReview ? (
        <DecisionReview
          attemptId={attempt.id}
          busy={busy}
          acceptLabel={
            step.pendingChoice?.acceptLabel ?? "Yes, use this choice"
          }
          recommendedOptionId={step.pendingChoice?.recommendedOptionId}
          options={step.pendingChoice?.options ?? []}
          decision={attempt.taskSnapshot?.decision}
          onAccept={onAccept}
          onOverrideDecision={onOverrideDecision}
          onOptimizeDecision={onOptimizeDecision}
          onEditDecisionWording={onEditDecisionWording}
          onAddDecisionOption={onAddDecisionOption}
        />
      ) : (
        <ToolReview
          attemptId={attempt.id}
          busy={busy}
          onRequestRevision={onRequestRevision}
          onAccept={onAccept}
        />
      )}

      {proposal ? (
        <RevisionProposalEditor
          attemptId={attempt.id}
          busy={busy}
          proposal={proposal}
          onApplyRevision={onApplyRevision}
        />
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy === "cancel"}
          onClick={onCancel}
        >
          {busy === "cancel" ? <Spinner /> : <Square />}
          Cancel run
        </Button>
      </div>
    </div>
  );
}
