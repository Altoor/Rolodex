import { Trash2 } from "lucide-react";
import { Button } from "#components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Textarea } from "#components/ui/textarea";
import type { TaskOption } from "../taskCard.types";
import type { SwitchCaseDraft } from "./switchTaskConfig";
import { SwitchTargetSelect } from "./switchTargetSelect";

interface SwitchCaseEditorProps {
  entry: SwitchCaseDraft;
  tasks: TaskOption[];
  error?: string;
  onChange: (patch: Partial<SwitchCaseDraft>) => void;
  onRemove: () => void;
}

export function SwitchCaseEditor({
  entry,
  tasks,
  error,
  onChange,
  onRemove,
}: SwitchCaseEditorProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-end gap-2">
        <Field className="flex-1">
          <FieldLabel htmlFor={`switch-label-${entry.id}`}>Label</FieldLabel>
          <Input
            id={`switch-label-${entry.id}`}
            value={entry.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </Field>

        <Field className="flex-1">
          <FieldLabel htmlFor={`switch-target-${entry.id}`}>
            Target task
          </FieldLabel>
          <SwitchTargetSelect
            id={`switch-target-${entry.id}`}
            value={entry.nextTaskId}
            tasks={tasks}
            noTargetLabel="No target — stop the run"
            onChange={(nextTaskId) => onChange({ nextTaskId })}
          />
        </Field>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove case ${entry.label}`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      <Field>
        <FieldLabel htmlFor={`switch-when-${entry.id}`}>
          Condition (JSON)
        </FieldLabel>
        <Textarea
          id={`switch-when-${entry.id}`}
          value={entry.whenText}
          placeholder='{ "has": { "path": "id" } }'
          className="min-h-24 font-mono text-xs"
          onChange={(event) => onChange({ whenText: event.target.value })}
        />
        <FieldDescription>
          Uses the if-tool condition syntax. Leave empty for an unconditional
          case.
        </FieldDescription>
        {error ? <FieldError errors={[{ message: error }]} /> : null}
      </Field>
    </div>
  );
}
