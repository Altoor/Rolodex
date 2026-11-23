import { db } from "@repo/db";
import { getUserSettings } from "../schema/user/user-settings-service";
import { awaitStep } from "./step-store";
import type { QueuedRow, TaskRow } from "./types";
import type { PendingChoice } from "./user-choice";

/**
 * Asks the user to confirm or replace the next step when flow auto improvement
 * is on. The row has already been claimed (status `running`); this parks it as
 * `awaiting_input` and returns true so the processor leaves it alone until the
 * user answers.
 *
 * Planner-created runs are exempt: they were designed as a whole flow, so they
 * execute end to end and are reviewed once the run finishes. The first step of
 * any run is not gated, and a row the user already approved (a runtime gate
 * answer or an explicit decision-target wiring) runs directly.
 */
export async function gateNextStep(
  row: QueuedRow,
  task: TaskRow,
): Promise<boolean> {
  if (row.depth === 0 || row.nextStepApproved) return false;

  const root = await db.query.queuedTasks.findFirst({
    where: { runId: row.runId, depth: 0 },
  });
  if (root?.autoPlanned) return false;

  const settings = await getUserSettings(row.queued_by);
  if (!settings.flowAutoImprovement) return false;

  const summary = `Waiting to confirm "${task.name}"`;

  const pendingChoice: PendingChoice = {
    kind: "nextStep",
    taskId: task.id,
    prompt: `Run "${task.name}" next?`,
    choiceType: "list",
    acceptLabel: "Run",
    recommendedOptionId: "nextStep:proposed",
    options: [
      {
        id: "nextStep:proposed",
        label: `Run ${task.name}`,
        value: null,
        resultTaskId: task.id,
        appendState: false,
        source: "static",
      },
    ],
    createdAt: new Date().toISOString(),
  };

  await awaitStep(
    row.id,
    pendingChoice,
    {
      branch: "awaiting_approval",
      nextTaskId: task.id,
      summary,
    },
    summary,
  );

  return true;
}
