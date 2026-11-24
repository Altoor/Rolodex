import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { db, queuedTasks, runs, stepAttempts, tasks, users } from "@repo/db";
import { acceptAttempt } from "../assisted/application/accept-attempt";
import { applyStepRevision } from "../assisted/application/apply-revision";
import { startAssistedRun } from "../assisted/application/start-run";
import type { TaskRow } from "../queue/types";

const marker = `assisted-revision-smoke-${Date.now()}`;

async function ensureUser(): Promise<number> {
  const [existing] = await db.select().from(users).limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      name: "Assisted Revision Smoke",
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

export async function firstStep(runId: string) {
  const [step] = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, runId))
    .orderBy(queuedTasks.id)
    .limit(1);
  return step;
}

async function latestAwaitingStep(runId: string) {
  const rows = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, runId))
    .orderBy(desc(queuedTasks.id));
  return rows.find((row) => row.status === "awaiting_input");
}

interface Fixture {
  userId: number;
  start: TaskRow;
  terminalId: number;
}

async function createFixture(userId: number): Promise<Fixture> {
  const [terminal] = await db
    .insert(tasks)
    .values({
      name: `${marker} terminal`,
      type: "tool",
      toolKey: "set_state",
      toolConfig: { format: "text", clearToolState: true },
      toolOutputType: "normal",
      canRunInParallel: false,
    })
    .returning();
  if (!terminal) throw new Error("failed to create terminal task");

  const [start] = await db
    .insert(tasks)
    .values({
      name: `${marker} start`,
      type: "tool",
      toolKey: "set_state",
      toolConfig: { format: "json", clearToolState: false },
      toolOutputType: "normal",
      fallbackTaskId: terminal.id,
      canRunInParallel: false,
    })
    .returning();
  if (!start) throw new Error("failed to create start task");

  return { userId, start, terminalId: terminal.id };
}

/** Waits for the next parked step and returns it with its latest attempt. */
async function nextReview(runId: string) {
  await waitForRunStatus(runId, ["awaiting_step_review"]);
  const step = await latestAwaitingStep(runId);
  if (!step) throw new Error("no awaiting step");
  const attempt = await currentAttempt(step.id);
  if (!attempt) throw new Error("no attempt for awaiting step");
  return { step, attempt };
}

async function runTool(
  fixture: Fixture,
  state: string,
): Promise<string> {
  // Earlier strategies rewire the start task's fallback; reset it so every
  // strategy starts from the same fixture.
  await db
    .update(tasks)
    .set({ fallbackTaskId: fixture.terminalId })
    .where(eq(tasks.id, fixture.start.id));

  const run = await startAssistedRun(fixture.userId, {
    taskId: fixture.start.id,
    state,
  });
  return run.id;
}

async function runNextStrategy(fixture: Fixture) {
  const runId = await runTool(fixture, JSON.stringify({ strategy: "runNext" }));
  const { attempt } = await nextReview(runId);

  await applyStepRevision(fixture.userId, attempt.id, {
    kind: "runNext",
    explanation: "skip the broken step and continue",
    confidence: 0.9,
    nextTaskId: fixture.terminalId,
    warnings: [],
  });

  const terminalReview = await nextReview(runId);
  console.log("runNext", {
    skippedTaskId: terminalReview.step.taskId,
    terminalId: fixture.terminalId,
  });
  if (terminalReview.step.taskId !== fixture.terminalId) {
    throw new Error("runNext did not queue the requested task");
  }

  await acceptAttempt(fixture.userId, terminalReview.attempt.id);
  const completed = await waitForRunStatus(runId, ["completed"]);
  console.log("runNext completed", completed.status);
}

async function insertAfterStrategy(fixture: Fixture) {
  const runId = await runTool(fixture, JSON.stringify({ strategy: "insertAfter" }));
  const { attempt } = await nextReview(runId);

  await applyStepRevision(fixture.userId, attempt.id, {
    kind: "insertAfter",
    explanation: "add a cleanup step after the accepted step",
    confidence: 0.85,
    insertions: [
      {
        name: `${marker} inserted after`,
        type: "tool",
        toolKey: "set_state",
        toolConfig: { format: "text", clearToolState: true },
        toolOutputType: "normal",
      },
    ],
    warnings: [],
  });

  const inserted = await nextReview(runId);
  console.log("insertAfter", {
    insertedTaskId: inserted.step.taskId,
  });
  if (inserted.step.taskId === fixture.start.id) {
    throw new Error("insertAfter did not queue an inserted step");
  }

  await acceptAttempt(fixture.userId, inserted.attempt.id);
  const next = await nextReview(runId);
  if (next.step.taskId !== fixture.terminalId) {
    throw new Error("insertAfter did not continue to the original next task");
  }
  await acceptAttempt(fixture.userId, next.attempt.id);
  const completed = await waitForRunStatus(runId, ["completed"]);
  console.log("insertAfter completed", completed.status);
}

async function insertBeforeStrategy(fixture: Fixture) {
  const runId = await runTool(fixture, JSON.stringify({ strategy: "insertBefore" }));
  const original = await nextReview(runId);

  await applyStepRevision(fixture.userId, original.attempt.id, {
    kind: "insertBefore",
    explanation: "prepare the input before retrying the step",
    confidence: 0.85,
    insertions: [
      {
        name: `${marker} inserted before`,
        type: "tool",
        toolKey: "set_state",
        toolConfig: { format: "text", clearToolState: true },
        toolOutputType: "normal",
      },
    ],
    warnings: [],
  });

  const inserted = await nextReview(runId);
  if (inserted.step.taskId === fixture.start.id) {
    throw new Error("insertBefore did not queue an inserted step");
  }
  await acceptAttempt(fixture.userId, inserted.attempt.id);

  const retried = await nextReview(runId);
  console.log("insertBefore", {
    insertedTaskId: inserted.step.taskId,
    retriedTaskId: retried.step.taskId,
  });
  if (retried.step.taskId !== fixture.start.id) {
    throw new Error("insertBefore did not retry the original step");
  }
  await acceptAttempt(fixture.userId, retried.attempt.id);

  const next = await nextReview(runId);
  if (next.step.taskId !== fixture.terminalId) {
    throw new Error("insertBefore did not continue to the original next task");
  }
  await acceptAttempt(fixture.userId, next.attempt.id);
  const completed = await waitForRunStatus(runId, ["completed"]);
  console.log("insertBefore completed", completed.status);
}

async function insertBeforeAndAfterStrategy(fixture: Fixture) {
  const runId = await runTool(
    fixture,
    JSON.stringify({ strategy: "insertBeforeAndAfter" }),
  );
  const original = await nextReview(runId);

  await applyStepRevision(fixture.userId, original.attempt.id, {
    kind: "insertBeforeAndAfter",
    explanation: "wrap the step with a preparation and a cleanup task",
    confidence: 0.8,
    insertions: [
      {
        name: `${marker} wrap before`,
        type: "tool",
        toolKey: "set_state",
        toolConfig: { format: "text", clearToolState: true },
        toolOutputType: "normal",
      },
      {
        name: `${marker} wrap after`,
        type: "tool",
        toolKey: "set_state",
        toolConfig: { format: "text", clearToolState: true },
        toolOutputType: "normal",
      },
    ],
    warnings: [],
  });

  const before = await nextReview(runId);
  await acceptAttempt(fixture.userId, before.attempt.id);

  const retried = await nextReview(runId);
  if (retried.step.taskId !== fixture.start.id) {
    throw new Error("insertBeforeAndAfter did not retry the original step");
  }
  await acceptAttempt(fixture.userId, retried.attempt.id);

  const after = await nextReview(runId);
  if (after.step.taskId === fixture.start.id) {
    throw new Error("insertBeforeAndAfter did not run the after task");
  }
  console.log("insertBeforeAndAfter", {
    beforeTaskId: before.step.taskId,
    retriedTaskId: retried.step.taskId,
    afterTaskId: after.step.taskId,
  });
  await acceptAttempt(fixture.userId, after.attempt.id);

  const next = await nextReview(runId);
  if (next.step.taskId !== fixture.terminalId) {
    throw new Error("insertBeforeAndAfter did not reach the original next task");
  }
  await acceptAttempt(fixture.userId, next.attempt.id);
  const completed = await waitForRunStatus(runId, ["completed"]);
  console.log("insertBeforeAndAfter completed", completed.status);
}

async function main() {
  const userId = await ensureUser();
  const fixture = await createFixture(userId);

  await runNextStrategy(fixture);
  await insertAfterStrategy(fixture);
  await insertBeforeStrategy(fixture);
  await insertBeforeAndAfterStrategy(fixture);

  console.log("assisted revision smoke passed");
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
