"use client";

import { useState } from "react";
import { Check, Plus, Sparkles, Wand2 } from "lucide-react";
import { Button } from "#components/ui/button";
import { FieldDescription } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { ManualWordingEditor } from "./manual-wording-editor";
import type { AssistedPendingChoice, SnapshotDecision } from "../types";

interface DecisionReviewProps {
  attemptId: number;
  busy: string | null;
  acceptLabel: string;
  recommendedOptionId?: string | null;
  options: AssistedPendingChoice["options"];
  decision?: SnapshotDecision | null;
  onAccept: (attemptId: number) => void;
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
}

/** Review controls for a decision attempt: accept, override, or refine. */
export function DecisionReview({
  attemptId,
  busy,
  acceptLabel,
  recommendedOptionId,
  options,
  decision,
  onAccept,
  onOverrideDecision,
  onOptimizeDecision,
  onEditDecisionWording,
  onAddDecisionOption,
}: DecisionReviewProps) {
  const [feedback, setFeedback] = useState("");
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [optimize, setOptimize] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [newOptionDescription, setNewOptionDescription] = useState("");
  const [newOptionTarget, setNewOptionTarget] = useState("");
  const [manualWording, setManualWording] = useState(false);

  const busyAccept = busy === `accept:${attemptId}`;
  const busyOptimize = busy === `optimize:${attemptId}`;
  const busyOverride = busy === `override:${attemptId}`;
  const busyOption = busy === `option:${attemptId}`;

  return (
    <div className="flex flex-col gap-2">
      <FieldDescription className="text-xs">
        Is this the right choice? Accept it, pick the option that should have
        won instead, or add a new one.
      </FieldDescription>
      <div>
        <Button
          type="button"
          size="sm"
          disabled={busyAccept || busy != null}
          onClick={() => onAccept(attemptId)}
        >
          {busyAccept ? <Spinner /> : <Check />}
          {acceptLabel}
        </Button>
      </div>
      <FieldDescription className="text-xs">
        Different choice (select one, then use it for this run or optimize the
        wording):
      </FieldDescription>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
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
                  : option.id === recommendedOptionId
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
                onOverrideDecision(attemptId, selectedResultId);
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
              disabled={busyOptimize || selectedResultId == null || busy != null}
              onClick={() => {
                if (selectedResultId != null) {
                  onOptimizeDecision(
                    attemptId,
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
        {manualWording && decision ? (
          <ManualWordingEditor
            key={attemptId}
            decision={decision}
            busy={busy === `wording:${attemptId}`}
            onSubmit={(input) => onEditDecisionWording(attemptId, input)}
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
            onChange={(event) => setNewOptionDescription(event.target.value)}
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
              onAddDecisionOption(attemptId, {
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
  );
}
