"use client";

import { useQuery } from "@apollo/client/react";
import { useCallback, useMemo } from "react";
import type { AssistedRun } from "../types";
import { ASSISTED_RUN } from "./assisted-documents";
import { useAssistedRunActions } from "./use-assisted-run-actions";

export * from "./assisted-documents";
export {
  useAssistedRunStarter,
  type StartAssistedRunVariables,
} from "./use-assisted-run-starter";
export { useAttemptTrace } from "./use-attempt-trace";

interface AssistedRunQueryData {
  assistedRun: AssistedRun | null;
}

/** Live assisted-run read model plus the review mutations. */
export function useAssistedRun(runId: string | null) {
  const { data, loading, error, refetch } = useQuery<AssistedRunQueryData>(
    ASSISTED_RUN,
    {
      variables: { runId },
      skip: !runId,
      fetchPolicy: "network-only",
    },
  );

  const run = data?.assistedRun ?? null;

  const refresh = useCallback(() => {
    if (runId) void refetch();
  }, [refetch, runId]);

  const actions = useAssistedRunActions(runId, refresh);

  return useMemo(
    () => ({
      run,
      loading,
      error: error?.message ?? null,
      ...actions,
      refresh,
    }),
    [run, loading, error, actions, refresh],
  );
}
