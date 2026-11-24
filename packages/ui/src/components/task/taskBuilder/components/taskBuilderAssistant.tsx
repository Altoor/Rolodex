"use client";

import { useMutation } from "@apollo/client/react";
import { ANSWER_USER_DECISION } from "@repo/queries/tasks/task-mutations";
import { Bot, Play, X } from "lucide-react";
import { useState } from "react";
import { AssistedRuns, useAssistedRunStarter } from "../../../assisted";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import type { BuilderTaskSnapshot } from "../build-task-snapshot";

interface TaskBuilderAssistantProps {
  /** Saved task id, or undefined when the draft is not saved yet. */
  taskId: number | undefined;
  /** Builds the current (possibly unsaved) builder draft for the run. */
  getSnapshot: () => BuilderTaskSnapshot;
  /** Called with the run's start task id so the builder can adopt a draft. */
  onStarted: (taskId: number | null) => void;
  onClose: () => void;
}

/**
 * The bot panel on the task builder. It runs the current unsaved draft as an
 * assisted run: every tool/decision step pauses for review, and accepting a
 * step persists the draft snapshot.
 */
export function TaskBuilderAssistant({
  taskId,
  getSnapshot,
  onStarted,
  onClose,
}: TaskBuilderAssistantProps) {
  const [prompt, setPrompt] = useState("");
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const starter = useAssistedRunStarter();
  const [answerUserDecision] = useMutation(ANSWER_USER_DECISION);

  const busy = starter.starting;

  const startRun = async () => {
    if (!prompt.trim() || busy) return;

    let snapshot: BuilderTaskSnapshot;
    try {
      snapshot = getSnapshot();
      if (snapshot.task.type === "decision" && snapshot.task.decisionId == null) {
        setSnapshotError(
          "This decision task has no decision attached. Choose or create a decision in the builder, then start the run again.",
        );
        return;
      }
      setSnapshotError(null);
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : String(err));
      return;
    }

    const run = await starter.start({
      taskId: taskId ?? null,
      taskSnapshot: snapshot as unknown as Record<string, unknown>,
      state: prompt,
    });
    if (run) onStarted(run.startTaskId ?? null);
  };

  const answerChoice = async (stepId: number, optionId: string) => {
    await answerUserDecision({ variables: { queuedTaskId: stepId, optionId } });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Assisted task run</p>
            <FieldDescription>
              Run this draft one step at a time. Each tool or decision outcome
              pauses so you can accept it, repair it, or cancel before its
              effects are committed.
            </FieldDescription>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close assistant"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="task-assistant-prompt">
            What situation should this draft run against?
          </FieldLabel>
          <Textarea
            id="task-assistant-prompt"
            value={prompt}
            disabled={busy}
            placeholder="For example: process the invoice folder I attached yesterday."
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void startRun();
              }
            }}
          />
        </Field>

        {snapshotError ? (
          <p className="text-xs text-destructive">{snapshotError}</p>
        ) : null}
        {starter.error ? (
          <p className="text-xs text-destructive">{starter.error}</p>
        ) : null}

        <div>
          <Button
            type="button"
            disabled={busy || !prompt.trim()}
            onClick={() => void startRun()}
          >
            {busy ? <Spinner /> : <Play />}
            Start assisted run
          </Button>
        </div>
      </div>

      <AssistedRuns
        enabled
        extraRunIds={starter.runIds}
        onAnswerUserChoice={(stepId, optionId) => {
          void answerChoice(stepId, optionId);
        }}
      />
    </div>
  );
}

export default TaskBuilderAssistant;
