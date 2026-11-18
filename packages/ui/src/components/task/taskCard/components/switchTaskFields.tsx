"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "#components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";
import type { TaskOption } from "../taskCard.types";
import { SwitchCaseEditor } from "./switchCaseEditor";
import {
  NO_TASK,
  buildSwitchConfig,
  newSwitchCaseId,
  readSwitchDraft,
  type SwitchCaseDraft,
  type SwitchDraft,
} from "./switchTaskConfig";
import { SwitchTargetSelect } from "./switchTargetSelect";

interface SwitchTaskFieldsProps {
  tasks: TaskOption[];
}

/**
 * Structured editor for the `switch` tool. It edits the same JSON textarea as
 * the generic config editor, so the raw JSON stays available for copy/paste.
 */
const SwitchTaskFields = ({ tasks }: SwitchTaskFieldsProps) => {
  const { control, setValue } = useFormContext<TaskFormValues>();
  const configText = useWatch({ control, name: "toolConfigText" });
  const [draft, setDraft] = useState<SwitchDraft>(() =>
    readSwitchDraft(configText),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastConfigText, setLastConfigText] = useState(configText);

  // Keep the editor in sync when the task is loaded or the raw JSON changes.
  // This derived-state reset happens during render, which avoids the
  // effect-then-rerender loop that a setState effect would cause.
  if (configText !== lastConfigText) {
    setLastConfigText(configText);
    setDraft(readSwitchDraft(configText));
    setErrors({});
  }

  const commit = (next: SwitchDraft) => {
    setDraft(next);

    const { config, errors: nextErrors } = buildSwitchConfig(configText, next);
    setErrors(nextErrors);

    if (!config) return;

    setValue("toolConfigText", JSON.stringify(config, null, 2), {
      shouldDirty: true,
    });
  };

  const updateCase = (id: string, patch: Partial<SwitchCaseDraft>) => {
    commit({
      ...draft,
      cases: draft.cases.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    });
  };

  const addCase = () => {
    commit({
      ...draft,
      cases: [
        ...draft.cases,
        {
          id: newSwitchCaseId(),
          label: `Case ${draft.cases.length + 1}`,
          whenText: "",
          nextTaskId: NO_TASK,
        },
      ],
    });
  };

  const removeCase = (id: string) => {
    commit({
      ...draft,
      cases: draft.cases.filter((entry) => entry.id !== id),
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Switch cases</p>
        <p className="text-xs text-muted-foreground">
          Cases are evaluated in order; the first match wins. Each case has its
          own output handle on the task flow. Leave a target empty to stop the
          run if that case matches.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="switch-path">Item path</FieldLabel>
          <Input
            id="switch-path"
            value={draft.path}
            placeholder="todos"
            onChange={(event) => commit({ ...draft, path: event.target.value })}
          />
          <FieldDescription>
            Optional array path. Without it, conditions run against each
            tool-state entry.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="switch-quantifier">Quantifier</FieldLabel>
          <Select
            value={draft.quantifier}
            onValueChange={(value) =>
              commit({
                ...draft,
                quantifier: value === "every" ? "every" : "some",
              })
            }
          >
            <SelectTrigger id="switch-quantifier" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="some">some — any entry/item</SelectItem>
                <SelectItem value="every">every — all entries/items</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {draft.cases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No cases yet. Add one to create an output handle.
        </p>
      ) : null}

      {draft.cases.map((entry) => (
        <SwitchCaseEditor
          key={entry.id}
          entry={entry}
          tasks={tasks}
          error={errors[entry.id]}
          onChange={(patch) => updateCase(entry.id, patch)}
          onRemove={() => removeCase(entry.id)}
        />
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addCase}>
        <Plus />
        Add case
      </Button>

      <Field>
        <FieldLabel htmlFor="switch-default">Default task</FieldLabel>
        <SwitchTargetSelect
          id="switch-default"
          value={draft.defaultTaskId}
          tasks={tasks}
          noTargetLabel="No default — stop when nothing matches"
          onChange={(defaultTaskId) => commit({ ...draft, defaultTaskId })}
        />
        <FieldDescription>
          Used when no case matches. The Default handle on the flow edits this
          value too.
        </FieldDescription>
      </Field>
    </div>
  );
};

export default SwitchTaskFields;
