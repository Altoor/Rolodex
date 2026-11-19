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
  wiringStepId,
  answerError,
  dismissError,
  setRunOpen,
  answerChoice,
  dismissRun,
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
          wiringStepId={wiringStepId}
          answerError={answerError}
          dismissError={dismissError}
          onAnswer={(stepId, optionId) => {
            void answerChoice(stepId, optionId);
          }}
          onDismiss={(stepId) => {
            void dismissRun(stepId);
          }}
          onWireDecisionTarget={wireDecisionTarget}
        />
      ))}
    </>
  );
}
