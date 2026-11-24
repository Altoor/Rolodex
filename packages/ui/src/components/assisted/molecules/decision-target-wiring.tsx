"use client";

import { useQuery } from "@apollo/client/react";
import { Check, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import type { AssistedAttempt, AssistedStep, NextTaskDraft } from "../types";

interface DecisionTargetWiringProps {
  step: AssistedStep;
  attempt: AssistedAttempt;
  busy: string | null;
  onDraft: (
    attemptId: number,
    feedback?: string,
    draft?: NextTaskDraft,
  ) => Promise<NextTaskDraft | null>;
  onWire: (attemptId: number, resultId: number, targetTaskId: number) => void;
  onCreate: (
    attemptId: number,
    resultId: number,
    draft: NextTaskDraft,
  ) => void;
}

type Mode = "ask" | "existing" | "new";

interface TaskOption {
  id: number;
  name: string;
  type: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The model chose a decision option that has no next task. Ask whether to
 * continue, then either wire an existing task or draft a new tool task inline.
 */
export function DecisionTargetWiring({
  step,
  attempt,
  busy,
  onDraft,
  onWire,
  onCreate,
}: DecisionTargetWiringProps) {
  const [mode, setMode] = useState<Mode>("ask");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [draft, setDraft] = useState<NextTaskDraft | null>(null);
  const [configText, setConfigText] = useState("");
  const [guidance, setGuidance] = useState("");
  const [refineFeedback, setRefineFeedback] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { data } = useQuery<{ tasks: TaskOption[] }>(TASKS);
  const result = attempt.result ?? {};
  const resultId =
    typeof result.unwiredResultId === "number" ? result.unwiredResultId : null;
  const option =
    typeof result.unwiredOption === "string"
      ? result.unwiredOption
      : "This choice";
  const description =
    typeof result.unwiredOptionDescription === "string"
      ? result.unwiredOptionDescription
      : null;

  const tasks = (data?.tasks ?? []).filter((task) => task.id !== step.taskId);
  const drafting = busy === `target-draft:${attempt.id}`;
  const wiring = busy === `target-wire:${attempt.id}`;
  const creating = busy === `target-create:${attempt.id}`;
  const anyBusy = busy != null || drafting || wiring || creating;

  const applyDraft = (next: NextTaskDraft) => {
    setDraft(next);
    setConfigText(JSON.stringify(next.toolConfig ?? {}, null, 2));
  };

  const startDraft = async (feedback?: string, current?: NextTaskDraft) => {
    if (resultId == null) return;
    setLocalError(null);
    const next = await onDraft(attempt.id, feedback, current);
    if (next) applyDraft(next);
  };

  const openNewTask = () => {
    setMode("new");
    setLocalError(null);
    if (!draft) void startDraft(guidance.trim() || undefined);
  };

  const wireExisting = () => {
    if (resultId == null) return;
    const targetTaskId = Number(selectedTaskId);
    if (!Number.isFinite(targetTaskId) || targetTaskId <= 0) {
      setLocalError("Choose a task to continue.");
      return;
    }
    setLocalError(null);
    onWire(attempt.id, resultId, targetTaskId);
  };

  const createAndContinue = () => {
    if (resultId == null || !draft) return;
    let toolConfig: Record<string, unknown>;
    try {
      const parsed = JSON.parse(configText || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Tool config must be a JSON object.");
      }
      toolConfig = parsed as Record<string, unknown>;
    } catch (err) {
      setLocalError(errorMessage(err));
      return;
    }

    setLocalError(null);
    onCreate(attempt.id, resultId, { ...draft, toolConfig });
  };

  if (resultId == null) {
    return (
      <FieldDescription className="text-xs text-destructive">
        This decision result is missing. Choose another option or cancel the run.
      </FieldDescription>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed bg-muted/20 p-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          The model chose “{option}”, but this option has no next task yet.
        </p>
        <FieldDescription className="text-xs">
          {description && description !== option
            ? `${description} Do you want to continue by giving it a next task?`
            : "Do you want to continue by giving it a next task?"}
        </FieldDescription>
      </div>

      {mode === "ask" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={anyBusy}
            onClick={() => {
              setMode("existing");
              setLocalError(null);
            }}
          >
            Use an existing task
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={anyBusy}
            onClick={openNewTask}
          >
            <Plus /> Create a new task
          </Button>
        </div>
      ) : null}

      {mode === "existing" ? (
        <div className="flex flex-col gap-2">
          <Field>
            <FieldLabel htmlFor={`target-task-${attempt.id}`}>
              Existing task
            </FieldLabel>
            <select
              id={`target-task-${attempt.id}`}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={selectedTaskId}
              disabled={anyBusy}
              onChange={(event) => setSelectedTaskId(event.target.value)}
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
              disabled={anyBusy || !selectedTaskId}
              onClick={wireExisting}
            >
              {wiring ? <Spinner /> : <Check />}
              Wire and continue
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => setMode("ask")}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "new" ? (
        <div className="flex flex-col gap-2">
          {drafting && !draft ? (
            <FieldDescription className="flex items-center gap-2 text-xs">
              <Spinner /> Drafting the next task…
            </FieldDescription>
          ) : null}

          {!draft && !drafting ? (
            <div className="flex flex-col gap-2">
              <Input
                value={guidance}
                disabled={anyBusy}
                placeholder="Optional guidance for the model"
                onChange={(event) => setGuidance(event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={anyBusy}
                onClick={() => void startDraft(guidance.trim() || undefined)}
              >
                <Sparkles /> Draft next task
              </Button>
            </div>
          ) : null}

          {draft ? (
            <div className="flex flex-col gap-2">
              {draft.explanation ? (
                <FieldDescription className="text-xs">
                  {draft.explanation}
                </FieldDescription>
              ) : null}
              <Field>
                <FieldLabel htmlFor={`target-name-${attempt.id}`}>
                  Task name
                </FieldLabel>
                <Input
                  id={`target-name-${attempt.id}`}
                  value={draft.name}
                  disabled={anyBusy}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`target-tool-${attempt.id}`}>
                    Tool
                  </FieldLabel>
                  <Input
                    id={`target-tool-${attempt.id}`}
                    value={draft.toolKey}
                    disabled={anyBusy}
                    onChange={(event) =>
                      setDraft({ ...draft, toolKey: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`target-output-${attempt.id}`}>
                    Output type
                  </FieldLabel>
                  <select
                    id={`target-output-${attempt.id}`}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={draft.toolOutputType ?? "normal"}
                    disabled={anyBusy}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        toolOutputType:
                          event.target.value === "foreach"
                            ? "foreach"
                            : "normal",
                      })
                    }
                  >
                    <option value="normal">normal</option>
                    <option value="foreach">foreach</option>
                  </select>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor={`target-config-${attempt.id}`}>
                  Tool config (JSON)
                </FieldLabel>
                <Textarea
                  id={`target-config-${attempt.id}`}
                  className="font-mono text-xs"
                  value={configText}
                  disabled={anyBusy}
                  onChange={(event) => setConfigText(event.target.value)}
                />
              </Field>

              <div className="flex flex-col gap-2 rounded border bg-background p-2">
                <Textarea
                  value={refineFeedback}
                  disabled={anyBusy}
                  placeholder="Ask the model to change the draft"
                  onChange={(event) => setRefineFeedback(event.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={anyBusy || !refineFeedback.trim()}
                  onClick={() => {
                    if (!refineFeedback.trim()) return;
                    void startDraft(refineFeedback.trim(), draft).then(() =>
                      setRefineFeedback(""),
                    );
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
                  disabled={anyBusy || !draft.name.trim() || !draft.toolKey.trim()}
                  onClick={createAndContinue}
                >
                  {creating ? <Spinner /> : <Check />}
                  Create and continue
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={anyBusy}
                  onClick={() => setMode("ask")}
                >
                  Back
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {localError ? (
        <FieldDescription className="text-xs text-destructive">
          {localError}
        </FieldDescription>
      ) : null}
    </div>
  );
}
