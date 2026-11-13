"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "#components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
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
import { Textarea } from "#components/ui/textarea";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";
import type { TaskOption } from "../taskCard.types";

const NO_TASK = "__none__";

interface CaseDraft {
  id: string;
  label: string;
  whenText: string;
  nextTaskId: string;
}

interface DraftState {
  path: string;
  quantifier: "some" | "every";
  cases: CaseDraft[];
  defaultTaskId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfig(text: string | undefined): Record<string, unknown> {
  if (!text?.trim()) return {};

  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formatWhen(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

function readDraft(text: string | undefined): DraftState {
  const config = parseConfig(text);
  const cases = Array.isArray(config.cases)
    ? config.cases.flatMap((entry, index): CaseDraft[] => {
        if (!isRecord(entry)) return [];

        return [
          {
            id:
              typeof entry.id === "string" && entry.id
                ? entry.id
                : `case-${index + 1}`,
            label:
              typeof entry.label === "string" && entry.label
                ? entry.label
                : `Case ${index + 1}`,
            whenText: formatWhen(entry.when),
            nextTaskId:
              typeof entry.nextTaskId === "number"
                ? String(entry.nextTaskId)
                : NO_TASK,
          },
        ];
      })
    : [];

  return {
    path: typeof config.path === "string" ? config.path : "",
    quantifier: config.quantifier === "every" ? "every" : "some",
    cases,
    defaultTaskId:
      typeof config.defaultTaskId === "number"
        ? String(config.defaultTaskId)
        : NO_TASK,
  };
}

function newCaseId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `case-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `case-${Math.random().toString(36).slice(2, 10)}`;
}

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
  const [draft, setDraft] = useState<DraftState>(() => readDraft(configText));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastConfigText, setLastConfigText] = useState(configText);

  // Keep the editor in sync when the task is loaded or the raw JSON changes.
  // This derived-state reset happens during render, which avoids the
  // effect-then-rerender loop that a setState effect would cause.
  if (configText !== lastConfigText) {
    setLastConfigText(configText);
    setDraft(readDraft(configText));
    setErrors({});
  }

  const commit = (next: DraftState) => {
    setDraft(next);

    const nextErrors: Record<string, string> = {};
    const cases = [];

    for (const entry of next.cases) {
      if (!entry.label.trim()) {
        nextErrors[entry.id] = "A case label is required.";
        continue;
      }

      let when: unknown;
      if (entry.whenText.trim()) {
        try {
          when = JSON.parse(entry.whenText);
        } catch (err) {
          nextErrors[entry.id] = `Invalid condition JSON: ${
            err instanceof Error ? err.message : String(err)
          }`;
          continue;
        }
      }

      cases.push({
        id: entry.id,
        label: entry.label.trim(),
        ...(when !== undefined ? { when } : {}),
        ...(entry.nextTaskId !== NO_TASK
          ? { nextTaskId: Number(entry.nextTaskId) }
          : {}),
      });
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const current = parseConfig(configText);
    const config: Record<string, unknown> = { ...current, cases };

    if (next.path.trim()) config.path = next.path.trim();
    else delete config.path;

    config.quantifier = next.quantifier;

    if (next.defaultTaskId !== NO_TASK) {
      config.defaultTaskId = Number(next.defaultTaskId);
    } else {
      delete config.defaultTaskId;
    }

    setValue("toolConfigText", JSON.stringify(config, null, 2), {
      shouldDirty: true,
    });
  };

  const updateCase = (id: string, patch: Partial<CaseDraft>) => {
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
          id: newCaseId(),
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
        <div
          key={entry.id}
          className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3"
        >
          <div className="flex items-end gap-2">
            <Field className="flex-1">
              <FieldLabel htmlFor={`switch-label-${entry.id}`}>Label</FieldLabel>
              <Input
                id={`switch-label-${entry.id}`}
                value={entry.label}
                onChange={(event) =>
                  updateCase(entry.id, { label: event.target.value })
                }
              />
            </Field>

            <Field className="flex-1">
              <FieldLabel htmlFor={`switch-target-${entry.id}`}>
                Target task
              </FieldLabel>
              <Select
                value={entry.nextTaskId}
                onValueChange={(value) =>
                  updateCase(entry.id, { nextTaskId: value ?? NO_TASK })
                }
              >
                <SelectTrigger
                  id={`switch-target-${entry.id}`}
                  className="w-full"
                >
                  <SelectValue placeholder="Choose a task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_TASK}>
                      No target — stop the run
                    </SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={String(task.id)}>
                        {task.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove case ${entry.label}`}
              onClick={() => removeCase(entry.id)}
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
              onChange={(event) =>
                updateCase(entry.id, { whenText: event.target.value })
              }
            />
            <FieldDescription>
              Uses the if-tool condition syntax. Leave empty for an
              unconditional case.
            </FieldDescription>
            {errors[entry.id] ? (
              <FieldError errors={[{ message: errors[entry.id] }]} />
            ) : null}
          </Field>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addCase}>
        <Plus />
        Add case
      </Button>

      <Field>
        <FieldLabel htmlFor="switch-default">Default task</FieldLabel>
        <Select
          value={draft.defaultTaskId}
          onValueChange={(value) =>
            commit({ ...draft, defaultTaskId: value ?? NO_TASK })
          }
        >
          <SelectTrigger id="switch-default" className="w-full">
            <SelectValue placeholder="Choose a task" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NO_TASK}>
                No default — stop when nothing matches
              </SelectItem>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={String(task.id)}>
                  {task.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          Used when no case matches. The Default handle on the flow edits this
          value too.
        </FieldDescription>
      </Field>
    </div>
  );
};

export default SwitchTaskFields;
