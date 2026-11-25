"use client";

import { Check, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import type { NextTaskDraft } from "../types";

interface NextTaskDraftFormProps {
  attemptId: number;
  draft: NextTaskDraft | null;
  configText: string;
  guidance: string;
  refineFeedback: string;
  drafting: boolean;
  creating: boolean;
  busy: boolean;
  onDraftChange: (draft: NextTaskDraft) => void;
  onConfigTextChange: (value: string) => void;
  onGuidanceChange: (value: string) => void;
  onRefineFeedbackChange: (value: string) => void;
  onStartDraft: (guidance?: string) => void;
  onRefine: (feedback: string) => void;
  onCreate: () => void;
  onBack: () => void;
}

/** Inline editor for a model-drafted next task. */
export function NextTaskDraftForm({
  attemptId,
  draft,
  configText,
  guidance,
  refineFeedback,
  drafting,
  creating,
  busy,
  onDraftChange,
  onConfigTextChange,
  onGuidanceChange,
  onRefineFeedbackChange,
  onStartDraft,
  onRefine,
  onCreate,
  onBack,
}: NextTaskDraftFormProps) {
  if (!draft) {
    if (drafting) {
      return (
        <FieldDescription className="flex items-center gap-2 text-xs">
          <Spinner /> Drafting the next task…
        </FieldDescription>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <Input
          value={guidance}
          disabled={busy}
          placeholder="Optional guidance for the model"
          onChange={(event) => onGuidanceChange(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onStartDraft(guidance.trim() || undefined)}
        >
          <Sparkles /> Draft next task
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {draft.explanation ? (
        <FieldDescription className="text-xs">
          {draft.explanation}
        </FieldDescription>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`target-name-${attemptId}`}>Task name</FieldLabel>
        <Input
          id={`target-name-${attemptId}`}
          value={draft.name}
          disabled={busy}
          onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
        />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`target-tool-${attemptId}`}>Tool</FieldLabel>
          <Input
            id={`target-tool-${attemptId}`}
            value={draft.toolKey}
            disabled={busy}
            onChange={(event) =>
              onDraftChange({ ...draft, toolKey: event.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`target-output-${attemptId}`}>
            Output type
          </FieldLabel>
          <select
            id={`target-output-${attemptId}`}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={draft.toolOutputType ?? "normal"}
            disabled={busy}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                toolOutputType:
                  event.target.value === "foreach" ? "foreach" : "normal",
              })
            }
          >
            <option value="normal">normal</option>
            <option value="foreach">foreach</option>
          </select>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`target-config-${attemptId}`}>
          Tool config (JSON)
        </FieldLabel>
        <Textarea
          id={`target-config-${attemptId}`}
          className="font-mono text-xs"
          value={configText}
          disabled={busy}
          onChange={(event) => onConfigTextChange(event.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2 rounded border bg-background p-2">
        <Textarea
          value={refineFeedback}
          disabled={busy}
          placeholder="Ask the model to change the draft"
          onChange={(event) => onRefineFeedbackChange(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !refineFeedback.trim()}
          onClick={() => {
            if (!refineFeedback.trim()) return;
            onRefine(refineFeedback.trim());
          }}
        >
          {drafting ? <Spinner /> : <RefreshCw />}
          Refine draft
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !draft.name.trim() || !draft.toolKey.trim()}
          onClick={onCreate}
        >
          {creating ? <Spinner /> : <Check />}
          Create and continue
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onBack}
        >
          Back
        </Button>
      </div>
    </div>
  );
}
