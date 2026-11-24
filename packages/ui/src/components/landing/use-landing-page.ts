"use client";

import { useQuery } from "@apollo/client/react";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useMemo, useRef } from "react";
import { useAuth } from "../auth/auth-provider";
import { useStartedAssistedRuns } from "../assisted";
import { useLandingComposer } from "./use-landing-composer";
import { useLandingRuns } from "./use-landing-runs";

/**
 * Composes the landing page container state: auth, task list, composer, and
 * the live run streams. The page itself stays presentational.
 */
export function useLandingPage() {
  const { user, loading: authLoading } = useAuth();
  const loggedIn = !!user;
  const userId = user?.id ?? null;

  const { data: tasksData, loading: tasksLoading } = useQuery(TASKS, {
    skip: !loggedIn,
  });
  const tasks = useMemo(() => tasksData?.tasks ?? [], [tasksData]);

  const runStream = useLandingRuns({ userId, loggedIn });
  const autoImprovement = user?.settings?.autoImprovement ?? false;
  const resetComposerRef = useRef<() => void>(() => {});
  const assisted = useStartedAssistedRuns();

  const composer = useLandingComposer({
    tasks,
    tasksLoading,
    defaultTaskId: user?.settings?.defaultTaskId ?? null,
    autoImprovement,
    resetRef: resetComposerRef,
    onTrackedStep: runStream.trackStep,
    onOpenRun: runStream.openRun,
    onAssistedStarted: (runId) => {
      assisted.track(runId);
      resetComposerRef.current();
    },
  });

  return {
    authLoading,
    loggedIn,
    tasks,
    composer,
    runs: runStream.state,
    autoImprovement,
    assistedRunIds: assisted.runIds,
    answerAssistedUserChoice: runStream.state.answerChoice,
  };
}
