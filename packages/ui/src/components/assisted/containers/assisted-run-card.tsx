"use client";

import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { useAssistedRun } from "../hooks/use-assisted-run";
import { AssistedRunTimeline } from "../organisms/assisted-run-timeline";

interface AssistedRunCardProps {
  runId: string;
  onAnswerUserChoice?: (stepId: number, optionId: string) => void;
}

/** Container for one run: loads the read model and wires its actions. */
export function AssistedRunCard({
  runId,
  onAnswerUserChoice,
}: AssistedRunCardProps) {
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
