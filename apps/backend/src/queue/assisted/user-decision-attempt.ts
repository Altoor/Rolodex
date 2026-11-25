import { finishAttempt, type TaskSnapshot } from "../../assisted/attempts";
import { setRunStatus } from "../run-store";
import type { QueuedRow, TaskRow } from "../types";
import { processUserDecisionStep } from "../processors/user-decision-step";
import { failedRun } from "./attempt-support";

export interface UserDecisionAttemptInput {
  row: QueuedRow;
  task: TaskRow;
  attemptId: number;
  snapshot: TaskSnapshot;
}

/** Parks a user-decision step and records the attempt as succeeded. */
export async function runUserDecisionAttempt(
  input: UserDecisionAttemptInput,
): Promise<void> {
  const { row, task, attemptId, snapshot } = input;

  const parked = await processUserDecisionStep(
    row,
    task,
    snapshot.userDecisionOptions,
  );

  if (!parked) {
    const note = "user decision has no options for this run";
    await finishAttempt(attemptId, {
      status: "failed",
      result: { note },
    });
    failedRun(row, note);
    return;
  }

  // The attempt has produced its pending choice; answering it marks the
  // attempt committed. Leaving it running would make history/cancel treat
  // an already parked decision as in-flight.
  await finishAttempt(attemptId, {
    status: "succeeded",
    afterState: row.state,
    afterToolState: row.toolState,
    result: parked.result,
  });
  await setRunStatus(row.runId, "awaiting_user_choice");
}
