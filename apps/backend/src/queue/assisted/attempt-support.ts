import { setRunStatus } from "../run-store";
import { recordTrace } from "../../assisted/infrastructure/trace";
import type { QueuedRow } from "../types";

/** Marks the run failed and records why a step could not finish. */
export function failedRun(row: QueuedRow, note: string): void {
  void setRunStatus(row.runId, "failed");
  void recordTrace({
    runId: row.runId,
    kind: "step.failed",
    payload: { note, stepId: row.id },
  });
}
