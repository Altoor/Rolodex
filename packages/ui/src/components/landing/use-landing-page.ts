"use client";

import { useQuery } from "@apollo/client/react";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useMemo, useRef } from "react";
import { useAuth } from "../auth/auth-provider";
import { useFlowStartAssistant } from "../flow/use-flow-start-assistant";
import { useLandingComposer } from "./use-landing-composer";
import { useLandingRuns } from "./use-landing-runs";

/**
 * Composes the landing page container state: auth, task list, composer, and
 * the live run stream. The page itself stays presentational.
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
  const flowAutoImprovement = user?.settings?.flowAutoImprovement ?? false;
  const resetComposerRef = useRef<() => void>(() => {});

  const flowAssistant = useFlowStartAssistant({
    onTrackedStep: runStream.trackStep,
    onOpenRun: runStream.openRun,
    onStarted: () => resetComposerRef.current(),
  });

  const composer = useLandingComposer({
    tasks,
    tasksLoading,
    defaultTaskId: user?.settings?.defaultTaskId ?? null,
    flowAutoImprovement,
    onAutoStart: flowAssistant.propose,
    resetRef: resetComposerRef,
    onTrackedStep: runStream.trackStep,
    onOpenRun: runStream.openRun,
  });

  return {
    authLoading,
    loggedIn,
    tasks,
    composer,
    runs: runStream.state,
    flowAutoImprovement,
    flowAssistant,
  };
}
