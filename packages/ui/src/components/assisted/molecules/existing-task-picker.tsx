"use client";

import { Check } from "lucide-react";
import { Button } from "#components/ui/button";
import { Field, FieldLabel } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import type { TargetTaskOption } from "../types";

interface ExistingTaskPickerProps {
  attemptId: number;
  tasks: TargetTaskOption[];
  selectedTaskId: string;
  busy: boolean;
  wiring: boolean;
  onSelectTask: (taskId: string) => void;
  onWire: () => void;
  onBack: () => void;
}

/** Pick an existing task to become the decision option's next step. */
export function ExistingTaskPicker({
  attemptId,
  tasks,
  selectedTaskId,
  busy,
  wiring,
  onSelectTask,
  onWire,
  onBack,
}: ExistingTaskPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor={`target-task-${attemptId}`}>
          Existing task
        </FieldLabel>
        <select
          id={`target-task-${attemptId}`}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={selectedTaskId}
          disabled={busy}
          onChange={(event) => onSelectTask(event.target.value)}
        >
          <option value="">Choose a task…</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name} ({task.type})
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !selectedTaskId}
          onClick={onWire}
        >
          {wiring ? <Spinner /> : <Check />}
          Wire and continue
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
