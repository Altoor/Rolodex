"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "#components/ui/button";
import { FieldDescription } from "#components/ui/field";
import type {
  AssistedAttempt,
  NextTaskDraft,
  TargetTaskOption,
} from "../types";
import { ExistingTaskPicker } from "./existing-task-picker";
import { NextTaskDraftForm } from "./next-task-draft-form";

interface DecisionTargetWiringProps {
  attempt: AssistedAttempt;
  busy: string | null;
  tasks: TargetTaskOption[];
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The model chose a decision option that has no next task. Ask whether to
 * continue, then either wire an existing task or draft a new tool task inline.
 */
export function DecisionTargetWiring({
  attempt,
  busy,
  tasks,
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
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
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
        <ExistingTaskPicker
          attemptId={attempt.id}
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          busy={anyBusy}
          wiring={wiring}
          onSelectTask={setSelectedTaskId}
          onWire={wireExisting}
          onBack={() => setMode("ask")}
        />
      ) : null}

      {mode === "new" ? (
        <NextTaskDraftForm
          attemptId={attempt.id}
          draft={draft}
          configText={configText}
          guidance={guidance}
          refineFeedback={refineFeedback}
          drafting={drafting}
          creating={creating}
          busy={anyBusy}
          onDraftChange={setDraft}
          onConfigTextChange={setConfigText}
          onGuidanceChange={setGuidance}
          onRefineFeedbackChange={setRefineFeedback}
          onStartDraft={(value) => void startDraft(value)}
          onRefine={(feedback) => {
            void startDraft(feedback, draft ?? undefined).then(() =>
              setRefineFeedback(""),
            );
          }}
          onCreate={createAndContinue}
          onBack={() => setMode("ask")}
        />
      ) : null}

      {localError ? (
        <FieldDescription className="text-xs text-destructive">
          {localError}
        </FieldDescription>
      ) : null}
    </div>
  );
}
