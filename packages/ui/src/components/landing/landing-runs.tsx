"use client";

import { FieldDescription } from "#components/ui/field";
import { Button } from "#components/ui/button";
import { History } from "lucide-react";
import { useState } from "react";
import { LandingRun } from "./landing-run";
import { StandardRunHistory } from "./standard-run-history";
import type { LandingRunsProps } from "./landing-model";

/** The landing page's standard run history, or a hint when nothing has run. */
export function LandingRuns({
  runs,
  tasks,
  openRuns,
  answeringStepId,
  dismissingStepId,
  retryingStepId,
  retryErrorStepId,
  answerError,
  dismissError,
  retryError,
  setRunOpen,
  answerChoice,
  dismissRun,
  retryStep,
}: LandingRunsProps) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {runs.length === 0 ? (
        <FieldDescription>
          No runs yet. Submit a state above to start one.
        </FieldDescription>
      ) : (
        runs.map((run) => (
          <LandingRun
            key={run.runId}
            run={run}
            tasks={tasks}
            open={run.pending ? true : (openRuns[run.runId] ?? true)}
            onOpenChange={(open) => setRunOpen(run.runId, open)}
            answeringStepId={answeringStepId}
            dismissingStepId={dismissingStepId}
            retryingStepId={retryingStepId}
            retryErrorStepId={retryErrorStepId}
            answerError={answerError}
            dismissError={dismissError}
            retryError={retryError}
            onAnswer={(stepId, optionId) => {
              void answerChoice(stepId, optionId);
            }}
            onDismiss={(stepId) => {
              void dismissRun(stepId);
            }}
            onRetry={(stepId) => {
              void retryStep(stepId);
            }}
          />
        ))
      )}
      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setShowHistory((current) => !current)}
        >
          <History />
          {showHistory ? "Hide history" : "Browse run history"}
        </Button>
      </div>
      {showHistory ? <StandardRunHistory tasks={tasks} /> : null}
    </div>
  );
}
