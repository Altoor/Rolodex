"use client";

import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import type { StandardRunHistoryQuery } from "@repo/queries/__generated__/graphql";
import { LandingRun } from "./landing-run";
import {
  toStep,
  type LandingRun as LandingRunModel,
  type LandingTask,
} from "./landing-model";
import { useStandardRunHistory } from "./use-standard-run-history";

type HistoryRunRow = NonNullable<
  StandardRunHistoryQuery["standardRunHistory"]
>[number];

const noop = () => undefined;

function statusLabel(status: HistoryRunRow["status"]): string {
  return (status ?? "completed").replaceAll("_", " ");
}

/** One finished standard run, collapsed until the user opens it. */
function HistoryRun({
  row,
  tasks,
}: {
  row: HistoryRunRow;
  tasks: LandingTask[];
}) {
  const steps = (row.steps ?? []).flatMap((step) => {
    const mapped = toStep(step);
    return mapped ? [mapped] : [];
  });

  const run: LandingRunModel = {
    runId: row.id ?? "",
    state: row.state,
    steps,
    startTaskId: row.startTaskId ?? steps[0]?.taskId ?? null,
    pending: false,
    awaitingInput: false,
    failed: row.status === "failed",
    cancelled: row.status === "cancelled",
  };

  return (
    <details className="rounded-md border p-2">
      <summary className="cursor-pointer text-xs font-medium">
        <span className="capitalize">{statusLabel(row.status)}</span>
        <span className="ml-2 font-normal text-muted-foreground">
          {new Date(row.createdAt as string).toLocaleString()} ·{" "}
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="mt-2">
        <LandingRun
          run={run}
          tasks={tasks}
          open
          onOpenChange={noop}
          readOnly
          answeringStepId={null}
          dismissingStepId={null}
          retryingStepId={null}
          retryErrorStepId={null}
          answerError={null}
          dismissError={null}
          retryError={null}
          onAnswer={noop}
          onDismiss={noop}
          onRetry={noop}
        />
      </div>
    </details>
  );
}

/** Finished/cancelled/failed standard runs, collapsed by default. */
export function StandardRunHistory({ tasks }: { tasks: LandingTask[] }) {
  const { runs, loading, error } = useStandardRunHistory(true);

  if (loading && runs.length === 0) {
    return (
      <FieldDescription className="flex items-center gap-2 text-xs">
        <Spinner /> Loading run history…
      </FieldDescription>
    );
  }
  if (error) {
    return (
      <FieldDescription className="text-xs text-destructive">
        {error}
      </FieldDescription>
    );
  }
  if (runs.length === 0) {
    return (
      <FieldDescription className="text-xs">
        No finished standard runs yet.
      </FieldDescription>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => (
        <HistoryRun key={run.id} row={run} tasks={tasks} />
      ))}
    </div>
  );
}
