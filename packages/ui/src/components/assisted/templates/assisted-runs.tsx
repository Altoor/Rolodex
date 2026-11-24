"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Button } from "#components/ui/button";
import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { useActiveAssistedRuns } from "../hooks/use-assisted-runs";
import { useAssistedRun } from "../hooks/use-assisted-run";
import { AssistedRunHistory } from "../organisms/assisted-run-history";
import { AssistedRunTimeline } from "../organisms/assisted-run-timeline";

interface AssistedRunCardProps {
  runId: string;
  onAnswerUserChoice?: (stepId: number, optionId: string) => void;
}

/** Container for one run: loads the read model and wires its actions. */
function AssistedRunCard({ runId, onAnswerUserChoice }: AssistedRunCardProps) {
  const assisted = useAssistedRun(runId);

  if (assisted.loading && !assisted.run) {
    return (
      <FieldDescription className="flex items-center gap-2 text-xs">
        <Spinner /> Loading assisted run…
      </FieldDescription>
    );
  }

  if (!assisted.run) {
    return assisted.error ? (
      <FieldDescription className="text-xs text-destructive">
        {assisted.error}
      </FieldDescription>
    ) : null;
  }

  return (
    <AssistedRunTimeline
      run={assisted.run}
      busy={assisted.busy}
      proposal={assisted.proposal}
      actionError={assisted.actionError}
      onAccept={assisted.accept}
      onRequestRevision={assisted.requestRevision}
      onApplyRevision={assisted.applyRevision}
      onOverrideDecision={assisted.overrideDecision}
      onOptimizeDecision={assisted.optimizeDecision}
      onEditDecisionWording={assisted.editDecisionWording}
      onAddDecisionOption={assisted.addDecisionOption}
      onDraftDecisionTarget={assisted.draftDecisionTarget}
      onWireDecisionTarget={assisted.wireDecisionTarget}
      onCreateDecisionTarget={assisted.createDecisionTarget}
      onSaveUserDecisionOptions={assisted.saveUserDecisionOptions}
      onCancel={assisted.cancel}
      onAnswerUserChoice={onAnswerUserChoice}
    />
  );
}

interface AssistedRunsProps {
  enabled: boolean;
  extraRunIds: string[];
  onAnswerUserChoice?: (stepId: number, optionId: string) => void;
}

/** Assisted runs started in this session plus any still awaiting review. */
export function AssistedRuns({
  enabled,
  extraRunIds,
  onAnswerUserChoice,
}: AssistedRunsProps) {
  const { runs, loading } = useActiveAssistedRuns(enabled);
  const [showHistory, setShowHistory] = useState(false);

  const runIds = useMemo(() => {
    const ids = new Set<string>(extraRunIds);
    for (const run of runs) ids.add(run.id);
    return [...ids];
  }, [runs, extraRunIds]);

  if (!enabled) return null;

  if (loading && runIds.length === 0) {
    return (
      <FieldDescription className="flex items-center gap-2 text-xs">
        <Spinner /> Loading assisted runs…
      </FieldDescription>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {runIds.length === 0 ? (
        <FieldDescription className="text-xs">
          No assisted runs waiting for review.
        </FieldDescription>
      ) : (
        runIds.map((runId) => (
          <AssistedRunCard
            key={runId}
            runId={runId}
            onAnswerUserChoice={onAnswerUserChoice}
          />
        ))
      )}
      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setShowHistory((current) => !current)}
        >
          <History />
          {showHistory ? "Hide history" : "Browse run history"}
        </Button>
      </div>
      {showHistory ? <AssistedRunHistory /> : null}
    </div>
  );
}
