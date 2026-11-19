"use client";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { PencilLine, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { PendingChoiceOption } from "#components/userDecision/userChoiceBlock";
import type { LandingTask } from "../../landing/landing-model";
import { TaskTargetSelect } from "../task-target-select";
import {
  useUserDecisionRevision,
  type UserDecisionOptionDraft,
} from "./use-user-decision-revision";

interface UserDecisionRevisionPanelProps {
  taskId: number;
  queuedTaskId: number;
  awaitingInput: boolean;
  state: string | null;
  currentOptions: PendingChoiceOption[];
  tasks: LandingTask[];
}

function errorMessage(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong.";
}

/** Quick-add missing options to a user-decision task, optionally refreshing a waiting run. */
export function UserDecisionRevisionPanel({
  taskId,
  queuedTaskId,
  awaitingInput,
  state,
  currentOptions,
  tasks,
}: UserDecisionRevisionPanelProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="ml-6"
        onClick={() => setOpen(true)}
      >
        <PencilLine /> Revise options
      </Button>
    );
  }

  return (
    <UserDecisionRevisionContent
      taskId={taskId}
      queuedTaskId={queuedTaskId}
      awaitingInput={awaitingInput}
      state={state}
      currentOptions={currentOptions}
      tasks={tasks}
      onClose={() => setOpen(false)}
    />
  );
}

function UserDecisionRevisionContent({
  taskId,
  queuedTaskId,
  awaitingInput,
  state,
  currentOptions,
  tasks,
  onClose,
}: UserDecisionRevisionPanelProps & { onClose: () => void }) {
  const { suggest, create, suggesting, creating, error, notice } =
    useUserDecisionRevision({ taskId, queuedTaskId, awaitingInput });
  const [prompt, setPrompt] = useState("");
  const [drafts, setDrafts] = useState<UserDecisionOptionDraft[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const updateDraft = (
    index: number,
    patch: Partial<UserDecisionOptionDraft>,
  ) => {
    setDrafts((previous) =>
      previous.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const runSuggest = async () => {
    setLocalError(null);
    try {
      const next = await suggest(prompt, state);
      setDrafts((previous) => [...previous, ...next]);
      setPrompt("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const addOptions = async () => {
    const usable = drafts.filter(
      (draft) => draft.label.trim() && draft.value.trim(),
    );
    if (usable.length === 0) {
      setLocalError("Each option needs a label and a machine value.");
      return;
    }

    setLocalError(null);
    try {
      await create(usable);
      setDrafts([]);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const busy = suggesting || creating;

  return (
    <div className="ml-6 mt-2 flex w-full max-w-xl flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Revise the options</p>
          <FieldDescription>
            Add an option here, or edit every field in the task builder.
          </FieldDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close option revision"
        >
          <X />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {currentOptions.length === 0 ? (
          <FieldDescription>No options are available yet.</FieldDescription>
        ) : (
          currentOptions.map((option) => (
            <Badge key={option.id} variant="secondary">
              {option.label}
            </Badge>
          ))
        )}
      </div>

      <Field>
        <FieldLabel>What is missing?</FieldLabel>
        <Textarea
          value={prompt}
          disabled={busy}
          placeholder="For example: add an option for a partial refund."
          onChange={(event) => setPrompt(event.target.value)}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !prompt.trim()}
          onClick={() => void runSuggest()}
        >
          {suggesting ? <Spinner /> : <Sparkles />}
          Suggest options
        </Button>
        <a
          className="inline-flex items-center text-xs underline underline-offset-4"
          href={`/task-queue?taskId=${taskId}`}
        >
          Edit in task builder
        </a>
      </div>

      {drafts.map((draft, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg border p-2">
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel>Label</FieldLabel>
              <Input
                value={draft.label}
                disabled={busy}
                onChange={(event) =>
                  updateDraft(index, { label: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel>Machine value</FieldLabel>
              <Input
                value={draft.value}
                disabled={busy}
                onChange={(event) =>
                  updateDraft(index, { value: event.target.value })
                }
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Input
              value={draft.description ?? ""}
              disabled={busy}
              onChange={(event) =>
                updateDraft(index, {
                  description: event.target.value || null,
                })
              }
            />
          </Field>
          <div className="flex items-end gap-2">
            <Field>
              <FieldLabel>Target task</FieldLabel>
              <TaskTargetSelect
                value={draft.resultTaskId}
                tasks={tasks}
                disabled={busy}
                noneLabel="No target (end the run)"
                onChange={(resultTaskId) =>
                  updateDraft(index, { resultTaskId })
                }
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              onClick={() =>
                setDrafts((previous) =>
                  previous.filter((_, draftIndex) => draftIndex !== index),
                )
              }
            >
              <X />
            </Button>
          </div>
        </div>
      ))}

      {error || localError ? (
        <p className="text-xs text-destructive">
          {errorMessage(error) ?? localError}
        </p>
      ) : null}
      {notice ? <FieldDescription>{notice}</FieldDescription> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || drafts.length === 0}
          onClick={() => void addOptions()}
        >
          {creating ? <Spinner /> : <Plus />}
          Add selected options
        </Button>
      </div>
      {awaitingInput ? (
        <FieldDescription>
          The waiting run refreshes automatically when you add options.
        </FieldDescription>
      ) : (
        <FieldDescription>
          This run already finished, so new options appear on the next run.
        </FieldDescription>
      )}
    </div>
  );
}
