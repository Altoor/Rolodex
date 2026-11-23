"use client";

import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import {
  CONFIRM_NEXT_STEP,
  REVIEW_FLOW_RUN,
  WIRE_DECISION_RESULT_TARGET,
} from "@repo/queries/flow/flow-mutations";
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
 * Owns the live run stream: active steps from the backend, subscription
 * updates, and the user-choice mutations. Steps are grouped into runs for the
 * landing page.
 */
export function useLandingRuns({ userId, loggedIn }: UseLandingRunsArgs) {
  const [answerUserDecision, { error: answerError }] =
    useMutation(ANSWER_USER_DECISION);
  const [confirmNextStepMutation, { error: confirmError }] =
    useMutation(CONFIRM_NEXT_STEP);
  const [dismissQueuedTask, { error: dismissError }] =
    useMutation(DISMISS_QUEUED_TASK);
  const [retryQueuedTask, { error: retryError }] =
    useMutation(RETRY_QUEUED_TASK);
  const [wireDecisionResultTarget] = useMutation(WIRE_DECISION_RESULT_TARGET);
  const [reviewFlowRun] = useMutation(REVIEW_FLOW_RUN);
  const [answeringStepId, setAnsweringStepId] = useState<number | null>(null);
  const [dismissingStepId, setDismissingStepId] = useState<number | null>(null);
  const [retryingStepId, setRetryingStepId] = useState<number | null>(null);
  const [retryErrorStepId, setRetryErrorStepId] = useState<number | null>(null);
  const [wiringStepId, setWiringStepId] = useState<number | null>(null);
  const [reviewingRunId, setReviewingRunId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Completed steps of an active run stay here so each chain-of-thought keeps
  // its history.
  const [liveRunState, setLiveRunState] = useState<LiveRunState>({
    userId: null,
    steps: [],
  });
  const [openRuns, setOpenRuns] = useState<Record<string, boolean>>({});

  const trackStep = useCallback(
    (step: QueuedTaskStep) => {
      setLiveRunState((previous) => ({
        userId,
        // Never mix steps from a previous session/user.
        steps: upsertStep(
          previous.userId === userId ? previous.steps : [],
          step,
        ),
      }));
    },
    [userId],
  );

  // Active runs may already exist when the page loads (another tab, a refresh,
  // or a run queued before this page mounted). Seed them from the backend;
  // live updates arrive through the subscription below.
  const { data: activeData } = useQuery(ACTIVE_QUEUED_TASKS, {
    skip: !loggedIn,
    fetchPolicy: "network-only",
  });

  useSubscription(QUEUED_TASK_EVENT, {
    skip: !loggedIn,
    onData: ({ data }) => {
      const event = data.data?.queuedTaskEvent?.queuedTask;
      if (!event) return;
      // The backend already filters per user; keep the guard for safety.
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

    // Live events are always fresher than the query snapshot.
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

  // Approves a runtime next-step gate, optionally replacing the proposed task
  // for this run only. Reuses the answering busy slot so all prompt buttons
  // disable together.
  const confirmNextStep = async (stepId: number, taskId?: number) => {
    setAnsweringStepId(stepId);
    try {
      const { data } = await confirmNextStepMutation({
        variables: { queuedTaskId: stepId, taskId },
      });
      const step = data?.confirmNextStep ? toStep(data.confirmNextStep) : null;
      if (step) trackStep(step);
    } finally {
      setAnsweringStepId(null);
    }
  };

  // Dismissing a choice ends its whole run; the mutation returns every step it
  // completed so the prompts disappear immediately.
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

  // Re-queues a failed step with its original task, state, and toolState. The
  // new row arrives through the subscription; tracking the mutation response
  // too makes it appear immediately.
  const retryStep = async (stepId: number) => {
    setRetryingStepId(stepId);
    setRetryErrorStepId(null);
    try {
      const { data } = await retryQueuedTask({ variables: { id: stepId } });
      const step = data?.retryQueuedTask ? toStep(data.retryQueuedTask) : null;
      if (step) trackStep(step);
    } catch {
      // The mutation error is exposed through retryError.
      setRetryErrorStepId(stepId);
    } finally {
      setRetryingStepId(null);
    }
  };

  // Wires the chosen decision option to a task and resumes the chain. Throws on
  // failure so the wiring panel can show the error inline.
  const wireDecisionTarget = async (
    stepId: number,
    resultId: number,
    targetTaskId: number,
  ) => {
    setWiringStepId(stepId);
    try {
      const { data } = await wireDecisionResultTarget({
        variables: { queuedTaskId: stepId, resultId, targetTaskId },
      });
      const step = data?.wireDecisionResultTarget
        ? toStep(data.wireDecisionResultTarget)
        : null;
      if (step) {
        trackStep(step);
      }
    } finally {
      setWiringStepId(null);
    }
  };

  // Accepts a finished auto-planned run, or re-plans it from the user's
  // feedback and starts the revised run. The returned row is the accepted root
  // or the new run's root, so it appears immediately.
  const reviewRun = async (
    runId: string,
    accepted: boolean,
    feedback?: string,
  ) => {
    setReviewingRunId(runId);
    setReviewError(null);
    try {
      const { data } = await reviewFlowRun({
        variables: { runId, accepted, feedback },
      });
      const step = data?.reviewFlowRun?.queuedTask
        ? toStep(data.reviewFlowRun.queuedTask)
        : null;
      if (step) {
        trackStep(step);
        if (!accepted) openRun(step.runId);
      }
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : "Could not review the run",
      );
    } finally {
      setReviewingRunId(null);
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
    wiringStepId,
    reviewingRunId,
    answerError: answerError?.message ?? confirmError?.message ?? null,
    dismissError: dismissError?.message ?? null,
    retryError: retryError?.message ?? null,
    reviewError,
    setRunOpen,
    answerChoice,
    confirmNextStep,
    dismissRun,
    retryStep,
    wireDecisionTarget,
    reviewRun,
  };

  return { state, trackStep, openRun };
}
