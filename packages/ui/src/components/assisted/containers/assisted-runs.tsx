"use client";

import { useMemo } from "react";
import { useActiveAssistedRuns } from "../hooks/use-assisted-runs";
import { AssistedRunsTemplate } from "../templates/assisted-runs";

interface AssistedRunsProps {
  enabled: boolean;
  extraRunIds: string[];
  onAnswerUserChoice?: (stepId: number, optionId: string) => void;
}

/**
 * Assisted runs started in this session plus any still awaiting review. This
 * container owns the query; the template stays presentational.
 */
export function AssistedRuns({
  enabled,
  extraRunIds,
  onAnswerUserChoice,
}: AssistedRunsProps) {
  const { runs, loading } = useActiveAssistedRuns(enabled);

  const runIds = useMemo(() => {
    const ids = new Set<string>(extraRunIds);
    for (const run of runs) ids.add(run.id);
    return [...ids];
  }, [runs, extraRunIds]);

  return (
    <AssistedRunsTemplate
      enabled={enabled}
      runIds={runIds}
      loading={loading}
      onAnswerUserChoice={onAnswerUserChoice}
    />
  );
}
