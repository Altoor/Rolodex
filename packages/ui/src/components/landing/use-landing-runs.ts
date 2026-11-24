"use client";

import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import {
  ANSWER_USER_DECISION,
  DISMISS_QUEUED_TASK,
  RETRY_QUEUED_TASK,
} from "@repo/queries/tasks/task-mutations";
import { ACTIVE_QUEUED_TASKS } from "@repo/queries/tasks/task-queries";
import { QUEUED_TASK_EVENT } from "@repo/queries/tasks/task-subscriptions";
import { useCallback, useMemo, useState } from "react";
import {
  groupRuns,
  toStep,
  upsertStep,
  type LandingRunsState,
  type QueuedTaskStep,
} from "./landing-model";

interface UseLandingRunsArgs {
  userId: number | null;
  loggedIn: boolean;
}

interface LiveRunState {
  userId: number | null;
  steps: QueuedTaskStep[];
}

/**
 * Owns the standard run stream: active steps from the backend, subscription
 * updates, and the user-choice mutations.
 */
export function useLandingRuns({ userId, loggedIn }: UseLandingRunsArgs) {
  const [answerUserDecision, { error: answerError }] =
    useMutation(ANSWER_USER_DECISION);
  const [dismissQueuedTask, { error: dismissError }] =
    useMutation(DISMISS_QUEUED_TASK);
  const [retryQueuedTask, { error: retryError }] =
    useMutation(RETRY_QUEUED_TASK);
  const [answeringStepId, setAnsweringStepId] = useState<number | null>(null);
  const [dismissingStepId, setDismissingStepId] = useState<number | null>(null);
  const [retryingStepId, setRetryingStepId] = useState<number | null>(null);
  const [retryErrorStepId, setRetryErrorStepId] = useState<number | null>(null);

  const [liveRunState, setLiveRunState] = useState<LiveRunState>({
    userId: null,
    steps: [],
  });
  const [openRuns, setOpenRuns] = useState<Record<string, boolean>>({});

  const trackStep = useCallback(
    (step: QueuedTaskStep) => {
      setLiveRunState((previous) => ({
        userId,
        steps: upsertStep(
          previous.userId === userId ? previous.steps : [],
          step,
        ),
      }));
    },
    [userId],
  );

  const { data: activeData } = useQuery(ACTIVE_QUEUED_TASKS, {
    skip: !loggedIn,
    fetchPolicy: "network-only",
    pollInterval: 1500,
  });

  useSubscription(QUEUED_TASK_EVENT, {
    skip: !loggedIn,
    onData: ({ data }) => {
      const event = data.data?.queuedTaskEvent?.queuedTask;
      if (!event) return;
      if (event.queued_by != null && event.queued_by !== userId) return;

      const step = toStep(event);
      if (step) trackStep(step);
    },
  });

  const steps = useMemo(() => {
    const byId = new Map<number, QueuedTaskStep>();

    for (const row of activeData?.activeQueuedTasks ?? []) {
      const step = toStep(row);
      if (step) byId.set(step.id, step);
    }

    if (liveRunState.userId === userId) {
      for (const step of liveRunState.steps) byId.set(step.id, step);
    }

    return [...byId.values()].sort((a, b) => a.id - b.id);
  }, [activeData, liveRunState, userId]);

  const runs = useMemo(() => groupRuns(steps), [steps]);

  const answerChoice = async (stepId: number, optionId: string) => {
    setAnsweringStepId(stepId);
    try {
      const { data } = await answerUserDecision({
        variables: { queuedTaskId: stepId, optionId },
      });
      const step = data?.answerUserDecision
        ? toStep(data.answerUserDecision)
        : null;
      if (step) trackStep(step);
    } finally {
      setAnsweringStepId(null);
    }
  };

  const dismissRun = async (stepId: number) => {
    setDismissingStepId(stepId);
    try {
      const { data } = await dismissQueuedTask({ variables: { id: stepId } });
      for (const row of data?.dismissQueuedTask ?? []) {
        const step = toStep(row);
        if (step) trackStep(step);
      }
    } finally {
      setDismissingStepId(null);
    }
  };

  const retryStep = async (stepId: number) => {
    setRetryingStepId(stepId);
    setRetryErrorStepId(null);
    try {
      const { data } = await retryQueuedTask({ variables: { id: stepId } });
      const step = data?.retryQueuedTask ? toStep(data.retryQueuedTask) : null;
      if (step) trackStep(step);
    } catch {
      setRetryErrorStepId(stepId);
    } finally {
      setRetryingStepId(null);
    }
  };

  const setRunOpen = useCallback((runId: string, open: boolean) => {
    setOpenRuns((previous) => ({ ...previous, [runId]: open }));
  }, []);

  const openRun = useCallback(
    (runId: string) => setRunOpen(runId, true),
    [setRunOpen],
  );

  const state: LandingRunsState = {
    runs,
    openRuns,
    answeringStepId,
    dismissingStepId,
    retryingStepId,
    retryErrorStepId,
    answerError: answerError?.message ?? null,
    dismissError: dismissError?.message ?? null,
    retryError: retryError?.message ?? null,
    setRunOpen,
    answerChoice,
    dismissRun,
    retryStep,
  };

  return { state, trackStep, openRun };
}
