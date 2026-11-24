"use client";

import { useQuery } from "@apollo/client/react";
import { useCallback, useState } from "react";
import {
  ACTIVE_ASSISTED_RUNS,
  ASSISTED_RUN_HISTORY,
} from "./use-assisted-run";
import type { AssistedRun } from "../types";

/** Runs that still need review or are executing. */
export function useActiveAssistedRuns(enabled: boolean) {
  const { data, loading } = useQuery<{ activeAssistedRuns: AssistedRun[] }>(
    ACTIVE_ASSISTED_RUNS,
    { skip: !enabled, fetchPolicy: "network-only" },
  );
  return { runs: data?.activeAssistedRuns ?? [], loading };
}

/** Finished runs, newest first. */
export function useAssistedRunHistory(enabled: boolean) {
  const { data, loading } = useQuery<{ assistedRunHistory: AssistedRun[] }>(
    ASSISTED_RUN_HISTORY,
    {
      variables: { limit: 20 },
      skip: !enabled,
      fetchPolicy: "network-only",
    },
  );
  return { runs: data?.assistedRunHistory ?? [], loading };
}

/** Tracks run ids started from the current composer submission. */
export function useStartedAssistedRuns() {
  const [runIds, setRunIds] = useState<string[]>([]);
  const track = useCallback((runId: string) => {
    setRunIds((previous) =>
      previous.includes(runId) ? previous : [...previous, runId],
    );
  }, []);

  return { runIds, track };
}
