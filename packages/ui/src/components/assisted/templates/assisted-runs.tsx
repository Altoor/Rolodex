"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "#components/ui/button";
import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { AssistedRunCard } from "../containers/assisted-run-card";
import { AssistedRunHistoryContainer } from "../containers/assisted-run-history-container";

export interface AssistedRunsTemplateProps {
  enabled: boolean;
  /** Active runs started in this session plus any still awaiting review. */
  runIds: string[];
  loading: boolean;
  onAnswerUserChoice?: (stepId: number, optionId: string) => void;
}

/** Presentational layout for assisted runs plus the history toggle. */
export function AssistedRunsTemplate({
  enabled,
  runIds,
  loading,
  onAnswerUserChoice,
}: AssistedRunsTemplateProps) {
  const [showHistory, setShowHistory] = useState(false);

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
      {showHistory ? <AssistedRunHistoryContainer /> : null}
    </div>
  );
}
