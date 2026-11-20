"use client";

import { FieldDescription } from "#components/ui/field";
import { LandingRun } from "./landing-run";
import type { LandingRunsProps } from "./landing-model";

/** The landing page's run history, or a hint when nothing has run yet. */
export function LandingRuns({
  runs,
  tasks,
  flowAutoImprovement,
  openRuns,
  answeringStepId,
  dismissingStepId,
  retryingStepId,
  retryErrorStepId,
  wiringStepId,
  answerError,
  dismissError,
  retryError,
  setRunOpen,
  answerChoice,
  confirmNextStep,
  dismissRun,
  retryStep,
  wireDecisionTarget,
}: LandingRunsProps) {
  if (runs.length === 0) {
    return (
      <FieldDescription>
        No runs yet. Submit a state above to start one.
      </FieldDescription>
    );
  }

  return (
    <>
      {runs.map((run) => (
        <LandingRun
          key={run.runId}
          run={run}
          tasks={tasks}
          flowAutoImprovement={flowAutoImprovement}
          open={run.pending ? true : (openRuns[run.runId] ?? true)}
          onOpenChange={(open) => setRunOpen(run.runId, open)}
          answeringStepId={answeringStepId}
          dismissingStepId={dismissingStepId}
          retryingStepId={retryingStepId}
          retryErrorStepId={retryErrorStepId}
          wiringStepId={wiringStepId}
          answerError={answerError}
          dismissError={dismissError}
          retryError={retryError}
          onAnswer={(stepId, optionId) => {
            void answerChoice(stepId, optionId);
          }}
          onConfirmNextStep={confirmNextStep}
          onDismiss={(stepId) => {
            void dismissRun(stepId);
          }}
          onRetry={(stepId) => {
            void retryStep(stepId);
          }}
          onWireDecisionTarget={wireDecisionTarget}
        />
      ))}
    </>
  );
}
