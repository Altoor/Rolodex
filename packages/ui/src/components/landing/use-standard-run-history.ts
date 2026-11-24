"use client";

import { useQuery } from "@apollo/client/react";
import { STANDARD_RUN_HISTORY } from "@repo/queries/tasks/task-queries";

/** Finished standard runs, newest first. */
export function useStandardRunHistory(enabled: boolean) {
  const { data, loading, error } = useQuery(STANDARD_RUN_HISTORY, {
    variables: { limit: 20 },
    skip: !enabled,
    fetchPolicy: "network-only",
  });

  return {
    runs: data?.standardRunHistory ?? [],
    loading,
    error: error?.message ?? null,
  };
}
