import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  queuedTasks,
  runs,
  stepAttempts,
  tasks,
  users,
} from "@repo/db";
import { acceptAttempt } from "../assisted/application/accept-attempt";
import { applyStepRevision } from "../assisted/application/apply-revision";
import { cancelAssistedRun } from "../assisted/application/cancel-run";
import { startAssistedRun } from "../assisted/application/start-run";

const marker = `assisted-run-smoke-${Date.now()}`;

async function ensureUser(): Promise<number> {
  const [existing] = await db.select().from(users).limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      name: "Assisted Smoke",
      email: `${marker}@example.test`,
      hashedPassword: "x",
    })
    .returning();
  if (!created) throw new Error("failed to create smoke user");
  return created.id;
}

async function waitForRunStatus(
  runId: string,
  statuses: string[],
  timeoutMs = 20_000,
) {
  const started = Date.now();
  for (;;) {
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    if (run && statuses.includes(run.status)) return run;
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `timed out waiting for run ${runId} status ${statuses.join("/")} (last ${run?.status})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function currentAttempt(stepId: number) {
  const [attempt] = await db
    .select()
    .from(stepAttempts)
    .where(eq(stepAttempts.queuedTaskId, stepId))
    .orderBy(desc(stepAttempts.attemptNumber))
    .limit(1);
  return attempt;
}

async function main() {
  const userId = await ensureUser();

  const [task] = await db
    .insert(tasks)
    .values({
      name: `${marker} task`,
      type: "tool",
      toolKey: "set_state",
      toolConfig: { format: "text", clearToolState: true },
      toolOutputType: "normal",
      canRunInParallel: false,
    })
    .returning();
  if (!task) throw new Error("failed to create task");

  const run = await startAssistedRun(userId, {
    taskId: task.id,
    state: JSON.stringify({ hello: "world" }),
  });

  const parked = await waitForRunStatus(run.id, ["awaiting_step_review"]);
  const [step] = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, run.id));
  if (!step) throw new Error("no assisted step");
  const firstAttempt = await currentAttempt(step.id);
  if (!firstAttempt) throw new Error("no attempt");
  console.log("initial attempt", {
    runStatus: parked.status,
    stepStatus: step.status,
    attempt: firstAttempt.attemptNumber,
    kind: firstAttempt.kind,
    status: firstAttempt.status,
  });

  // Reject with a manual revision: keep toolState instead of clearing it.
  await applyStepRevision(userId, firstAttempt.id, {
    kind: "updateToolConfig",
    explanation: "keep tool state for the next step",
    confidence: 0.9,
    taskPatch: { toolConfig: { format: "text", clearToolState: false } },
    warnings: [],
  });

  const revised = await waitForRunStatus(run.id, ["awaiting_step_review"]);
  const [revisedStep] = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, run.id));
  const revisedAttempt = revisedStep
    ? await currentAttempt(revisedStep.id)
    : undefined;
  if (!revisedAttempt) throw new Error("no revised attempt");
  console.log("revised attempt", {
    runStatus: revised.status,
    attempt: revisedAttempt.attemptNumber,
    kind: revisedAttempt.kind,
    status: revisedAttempt.status,
    cause: revisedAttempt.cause,
  });

  if (revisedAttempt.id === firstAttempt.id) {
    throw new Error("revision did not create a new attempt");
  }

  await acceptAttempt(userId, revisedAttempt.id);
  const accepted = await waitForRunStatus(run.id, ["completed"]);
  const [acceptedStep] = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, run.id));
  console.log("accepted", {
    runStatus: accepted.status,
    stepStatus: acceptedStep?.status,
  });

  // A second run exercises cancel: the uncommitted attempt is dropped.
  const run2 = await startAssistedRun(userId, {
    taskId: task.id,
    state: JSON.stringify({ goodbye: "world" }),
  });
  await waitForRunStatus(run2.id, ["awaiting_step_review"]);
  await cancelAssistedRun(userId, run2.id);
  const cancelled = await waitForRunStatus(run2.id, ["cancelled"]);
  const [cancelledStep] = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, run2.id));
  console.log("cancelled", {
    runStatus: cancelled.status,
    stepStatus: cancelledStep?.status,
    result: cancelledStep?.result,
  });

  if (accepted.status !== "completed" || acceptedStep?.status !== "completed") {
    throw new Error("accept did not complete the run");
  }
  if (cancelled.status !== "cancelled") {
    throw new Error("cancel did not cancel the run");
  }

  // Clean up the task (runs are left as cancelled history).
  await db.delete(tasks).where(and(eq(tasks.id, task.id)));
  console.log("assisted run smoke passed");
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
