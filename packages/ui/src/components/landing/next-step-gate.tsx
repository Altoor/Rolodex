"use client";

import { Button } from "#components/ui/button";
import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Play } from "lucide-react";
import { useState } from "react";
import { NextTaskWiring } from "../flow/next-task/next-task-wiring";
import type { LandingTask } from "./landing-model";

interface NextStepGateProps {
  taskName: string | null;
  tasks: LandingTask[];
  contextState: string;
  busy: boolean;
  dismissing: boolean;
  error: string | null;
  onRun: () => Promise<void>;
  onChoose: (taskId: number) => Promise<void>;
  onStop: () => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runtime gate shown when auto improvement is on and a step is about to start.
 * The user can run the proposed task, replace it for this run, or stop.
 */
export function NextStepGate({
  taskName,
  tasks,
  contextState,
  busy,
  dismissing,
  error,
  onRun,
  onChoose,
  onStop,
}: NextStepGateProps) {
  const [changing, setChanging] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const disabled = busy || dismissing;

  return (
    <div className="mt-1 ml-6 flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">
          Up next: {taskName ?? "the proposed task"}
        </p>
        <FieldDescription>
          Auto improvement is on. Confirm this step, or run a different one.
        </FieldDescription>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setRunError(null);
            void onRun().catch((err: unknown) => setRunError(messageFrom(err)));
          }}
        >
          {busy ? <Spinner /> : <Play />}
          Run this task
        </Button>
        {!changing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setChanging(true)}
          >
            Choose another task
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onStop}
        >
          Stop this run
        </Button>
      </div>

      {(runError ?? error) ? (
        <FieldDescription className="text-destructive">
          {runError ?? error}
        </FieldDescription>
      ) : null}

      {changing ? (
        <NextTaskWiring
          title="Pick the next step for this run"
          description="Use an existing task, or create a new one. This only changes the current run."
          contextState={contextState}
          tasks={tasks}
          disabled={disabled}
          onWired={onChoose}
          onEndFlow={onStop}
          onDismiss={onStop}
        />
      ) : null}
    </div>
  );
}
