"use client";

import { useState } from "react";
import { Button } from "#components/ui/button";
import { FieldDescription } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import type { AssistedStep } from "../types";

interface EditableOption {
  id: number;
  label: string;
  value: string;
  description: string;
}

function staticEditableOptions(step: AssistedStep): EditableOption[] {
  return (step.pendingChoice?.options ?? []).flatMap((option) => {
    if (!option.id.startsWith("static:")) return [];
    const id = Number(option.id.slice("static:".length));
    if (!Number.isFinite(id)) return [];
    return [
      {
        id,
        label: option.label,
        value: typeof option.value === "string" ? option.value : "",
        description: option.description ?? "",
      },
    ];
  });
}

/** User-decision review: choose an option and edit its wording, no model. */
export function UserChoiceReview({
  step,
  attemptId,
  busy,
  onAnswer,
  onSave,
}: {
  step: AssistedStep;
  attemptId: number | null;
  busy: string | null;
  onAnswer: (stepId: number, optionId: string) => void;
  onSave?: (
    attemptId: number,
    options: EditableOption[],
  ) => void;
}) {
  const pending = step.pendingChoice;
  const [drafts, setDrafts] = useState<EditableOption[]>(() =>
    staticEditableOptions(step),
  );
  const [editing, setEditing] = useState(false);
  const saving = attemptId != null && busy === `options:${attemptId}`;

  if (!pending) return null;

  const update = (id: number, patch: Partial<EditableOption>) => {
    setDrafts((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  return (
    <div className="mt-2 ml-6 flex flex-col gap-2 self-stretch">
      <FieldDescription className="text-xs">{pending.prompt}</FieldDescription>
      <div className="flex flex-wrap gap-2">
        {(pending.options ?? []).map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={busy != null}
            onClick={() => onAnswer(step.id, option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {drafts.length > 0 && onSave && attemptId != null ? (
        <details className="rounded-md border p-2">
          <summary className="cursor-pointer text-xs font-medium">
            Edit option wording
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {drafts.map((option) => (
              <div key={option.id} className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={option.label}
                  onChange={(event) =>
                    update(option.id, { label: event.target.value })
                  }
                  placeholder="Label"
                  disabled={!editing}
                />
                <Input
                  value={option.value}
                  onChange={(event) =>
                    update(option.id, { value: event.target.value })
                  }
                  placeholder="Value"
                  disabled={!editing}
                />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing((current) => !current)}
              >
                {editing ? "Done editing" : "Edit"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || !editing}
                onClick={() => onSave(attemptId, drafts)}
              >
                {saving ? <Spinner /> : null}
                Save options
              </Button>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}

