"use client";

import { FieldDescription } from "#components/ui/field";
import { ConfidenceBadge } from "../atoms/confidence-badge";
import { TraceAccordion } from "./trace-accordion";
import type { AssistedAttempt } from "../types";

interface AttemptSummaryProps {
  runId: string;
  attempt: AssistedAttempt;
}

/** The model's outcome for one attempt, plus its trace. */
export function AttemptSummary({ runId, attempt }: AttemptSummaryProps) {
  const result = attempt.result ?? {};
  const summary =
    typeof result.summary === "string" ? result.summary : "Attempt finished";
  const nextSteps = result.nextSteps;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{summary}</span>
        <ConfidenceBadge value={result.normalizedConfidence} />
      </div>
      {"output" in result ? (
        <pre className="max-h-56 overflow-auto rounded bg-background p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
          {JSON.stringify(result.output, null, 2)}
        </pre>
      ) : null}
      {result.branch === "unwired" ? (
        <FieldDescription className="text-xs">
          This choice has no next task yet. Choose or create one to continue.
        </FieldDescription>
      ) : Array.isArray(nextSteps) ? (
        <FieldDescription className="text-xs">
          {nextSteps.length} next step{nextSteps.length === 1 ? "" : "s"} will
          run after acceptance.
        </FieldDescription>
      ) : null}
      <TraceAccordion
        runId={runId}
        attemptId={attempt.id}
        summary={`Trace · attempt ${attempt.attemptNumber}`}
        live={attempt.status === "running"}
      />
    </div>
  );
}
