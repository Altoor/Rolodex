"use client";

import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { AssistedRunTimeline } from "./assisted-run-timeline";
import type { AssistedRun } from "../types";

const noop = () => undefined;

/** Read-only timeline for a finished assisted run. */
function HistoryRun({ run }: { run: AssistedRun }) {
  return (
    <details className="rounded-md border p-2">
      <summary className="cursor-pointer text-xs font-medium">
        <span className="capitalize">{run.status.replaceAll("_", " ")}</span>
        <span className="ml-2 font-normal text-muted-foreground">
          {new Date(run.createdAt).toLocaleString()} · {run.steps.length} step
          {run.steps.length === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="mt-2">
        <AssistedRunTimeline
          run={run}
          busy={null}
          proposal={null}
          actionError={null}
          onAccept={noop}
          onRequestRevision={noop}
          onApplyRevision={noop}
          onOverrideDecision={noop}
          onOptimizeDecision={noop}
          onEditDecisionWording={noop}
          onAddDecisionOption={noop}
          onDraftDecisionTarget={async () => null}
          onWireDecisionTarget={noop}
          onCreateDecisionTarget={noop}
          onCancel={noop}
        />
      </div>
    </details>
  );
}

interface AssistedRunHistoryProps {
  runs: AssistedRun[];
  loading: boolean;
}

/** Finished/cancelled/failed assisted runs, collapsed by default. */
export function AssistedRunHistory({ runs, loading }: AssistedRunHistoryProps) {
  if (loading && runs.length === 0) {
    return (
      <FieldDescription className="flex items-center gap-2 text-xs">
        <Spinner /> Loading run history…
      </FieldDescription>
    );
  }
  if (runs.length === 0) {
    return (
      <FieldDescription className="text-xs">
        No finished assisted runs yet.
      </FieldDescription>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => (
        <HistoryRun key={run.id} run={run} />
      ))}
    </div>
  );
}
