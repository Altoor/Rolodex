"use client";

import { useMutation } from "@apollo/client/react";
import { PLAN_AND_START_FLOW } from "@repo/queries/flow/flow-mutations";
import { useState } from "react";
import { toStep, type QueuedTaskStep } from "./landing-model";

interface UseLandingPlanArgs {
  onTrackedStep: (step: QueuedTaskStep) => void;
  onOpenRun: (runId: string) => void;
  onStarted: () => void;
}

/**
 * Plans and starts a whole flow in one mutation. The planner reuses the
 * existing task graph, creates the missing tasks, wires them, and starts the
 * first step as an auto-planned run.
 */
export function useLandingPlan({
  onTrackedStep,
  onOpenRun,
  onStarted,
}: UseLandingPlanArgs) {
  const [planAndStartMutation, { error }] = useMutation(PLAN_AND_START_FLOW);
  const [planning, setPlanning] = useState(false);

  const planAndStart = async (
    state: string,
    fileIds: number[],
    startTaskId: number | null,
  ) => {
    setPlanning(true);
    try {
      const { data } = await planAndStartMutation({
        variables: { state, fileIds, startTaskId },
      });

      const row = data?.planAndStartFlow?.queuedTask;
      const step = row ? toStep(row) : null;
      if (step) {
        onTrackedStep(step);
        onOpenRun(step.runId);
      }

      onStarted();
    } finally {
      setPlanning(false);
    }
  };

  return {
    planAndStart,
    planning,
    error: error?.message ?? null,
  };
}
