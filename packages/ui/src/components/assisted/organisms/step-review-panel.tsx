"use client";

import { useState } from "react";
import { Check, Plus, RotateCcw, Sparkles, Square, Wand2 } from "lucide-react";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { AttemptSummary } from "../molecules/attempt-summary";
import { DecisionChanges } from "../molecules/decision-changes";
import { DecisionTargetWiring } from "../molecules/decision-target-wiring";
import { ManualWordingEditor } from "../molecules/manual-wording-editor";
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
  const [feedback, setFeedback] = useState("");
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [optimize, setOptimize] = useState(false);
  const [draftProposal, setDraftProposal] = useState("");
  const [newOption, setNewOption] = useState("");
  const [newOptionDescription, setNewOptionDescription] = useState("");
  const [newOptionTarget, setNewOptionTarget] = useState("");
  const [manualWording, setManualWording] = useState(false);

  if (!attempt) {
    return (
      <FieldDescription className="ml-6 text-xs">
        Waiting for an attempt…
      </FieldDescription>
    );
  }

  const decisionReview = step.pendingChoice?.kind === "assistedDecisionReview";
  const decisionTarget = step.pendingChoice?.kind === "assistedDecisionTarget";
  const optionRows = step.pendingChoice?.options ?? [];
  const busyAccept = busy === `accept:${attempt.id}`;
  const busyRevise = busy === `revise:${attempt.id}`;
  const busyApply = busy === `apply:${attempt.id}`;
  const busyOptimize = busy === `optimize:${attempt.id}`;
  const busyOverride = busy === `override:${attempt.id}`;
  const busyOption = busy === `option:${attempt.id}`;

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
        <DecisionTargetWiring
          step={step}
          attempt={attempt}
          busy={busy}
          onDraft={onDraftDecisionTarget}
          onWire={onWireDecisionTarget}
          onCreate={onCreateDecisionTarget}
        />
      ) : decisionReview ? (
        <div className="flex flex-col gap-2">
          <FieldDescription className="text-xs">
            Is this the right choice? Accept it, pick the option that should
            have won instead, or add a new one.
          </FieldDescription>
          <div>
            <Button
              type="button"
              size="sm"
              disabled={busyAccept || busy != null}
              onClick={() => onAccept(attempt.id)}
            >
              {busyAccept ? <Spinner /> : <Check />}
              {step.pendingChoice?.acceptLabel ?? "Yes, use this choice"}
            </Button>
          </div>
          <FieldDescription className="text-xs">
            Different choice (select one, then use it for this run or optimize
            the wording):
          </FieldDescription>
          <div className="flex flex-wrap gap-2">
            {optionRows.map((option) => {
              const resultId = Number(option.id.replace("result:", ""));
              const selected = selectedResultId === resultId;
              return (
                <Button
                  key={option.id}
                  type="button"
                  size="sm"
                  variant={
                    selected
                      ? "default"
                      : option.id === step.pendingChoice?.recommendedOptionId
                        ? "secondary"
                        : "outline"
                  }
                  aria-pressed={selected}
                  disabled={busy != null}
                  onClick={() => {
                    if (!Number.isFinite(resultId)) return;
                    setSelectedResultId(resultId);
                  }}
                >
                  {option.label}
                  {option.resultTaskId == null ? (
                    <span className="text-[10px] font-normal opacity-70">
                      no next task
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <FieldDescription className="text-xs">
              {selectedResultId == null
                ? "Select the option the model should have chosen to continue or refine."
                : "Use this choice for this run only, or optimize the wording so the model chooses it next time."}
            </FieldDescription>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={selectedResultId == null || busy != null}
                onClick={() => {
                  if (selectedResultId != null) {
                    onOverrideDecision(attempt.id, selectedResultId);
                  }
                }}
              >
                {busyOverride ? <Spinner /> : <Check />}
                Use this choice for this run
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyOptimize}
                onClick={() => setOptimize((current) => !current)}
              >
                {busyOptimize ? <Spinner /> : <Wand2 />}
                {optimize ? "Hide wording editor" : "Optimize wording"}
              </Button>
            </div>
            {optimize ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="What should the model weigh differently?"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    busyOptimize || selectedResultId == null || busy != null
                  }
                  onClick={() => {
                    if (selectedResultId != null) {
                      onOptimizeDecision(
                        attempt.id,
                        selectedResultId,
                        feedback || undefined,
                      );
                    }
                  }}
                >
                  {busyOptimize ? <Spinner /> : <Sparkles />}
                  Try optimized wording
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy != null}
              onClick={() => setManualWording((current) => !current)}
            >
              {manualWording ? "Hide manual wording" : "Edit wording manually"}
            </Button>
            {manualWording && attempt.taskSnapshot?.decision ? (
              <ManualWordingEditor
                key={attempt.id}
                decision={attempt.taskSnapshot.decision}
                busy={busy === `wording:${attempt.id}`}
                onSubmit={(input) =>
                  onEditDecisionWording(attempt.id, input)
                }
              />
            ) : null}
          </div>

          <details className="rounded-md border p-2">
            <summary className="cursor-pointer text-xs font-medium">
              Add a new option
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <Input
                value={newOption}
                onChange={(event) => setNewOption(event.target.value)}
                placeholder="Option label"
              />
              <Input
                value={newOptionDescription}
                onChange={(event) =>
                  setNewOptionDescription(event.target.value)
                }
                placeholder="Description shown to the model"
              />
              <Input
                value={newOptionTarget}
                onChange={(event) => setNewOptionTarget(event.target.value)}
                placeholder="Target task id (optional)"
                inputMode="numeric"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyOption || !newOption.trim()}
                onClick={() =>
                  onAddDecisionOption(attempt.id, {
                    label: newOption,
                    description: newOptionDescription || undefined,
                    targetTaskId: newOptionTarget
                      ? Number(newOptionTarget)
                      : undefined,
                  })
                }
              >
                {busyOption ? <Spinner /> : <Plus />}
                Add and re-run
              </Button>
            </div>
          </details>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <FieldDescription className="text-xs">
            Describe the outcome you expected. The model proposes a concrete
            repair and re-runs this step from the checkpoint.
          </FieldDescription>
          <Textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="For example: the folder should be called alphabet, not abc"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyRevise || !feedback.trim()}
              onClick={() => onRequestRevision(attempt.id, feedback)}
            >
              {busyRevise ? <Spinner /> : <RotateCcw />}
              Propose a repair
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busyAccept}
              onClick={() => onAccept(attempt.id)}
            >
              {busyAccept ? <Spinner /> : <Check />}
              Accept step
            </Button>
          </div>
        </div>
      )}

      {proposal ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{proposal.kind}</Badge>
            <span className="text-sm">{proposal.explanation}</span>
          </div>
          <Field>
            <FieldLabel htmlFor={`proposal-${attempt.id}`}>
              Editable proposal
            </FieldLabel>
            <Textarea
              id={`proposal-${attempt.id}`}
              className="font-mono text-xs"
              value={draftProposal || JSON.stringify(proposal, null, 2)}
              onChange={(event) => setDraftProposal(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busyApply}
              onClick={() => {
                try {
                  const parsed = JSON.parse(
                    draftProposal || JSON.stringify(proposal),
                  ) as RevisionProposal;
                  onApplyRevision(attempt.id, parsed);
                } catch {
                  // Keep the text so the user can fix the JSON.
                }
              }}
            >
              {busyApply ? <Spinner /> : <Sparkles />}
              Try this
            </Button>
          </div>
        </div>
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
