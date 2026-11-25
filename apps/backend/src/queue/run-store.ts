import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, queuedTasks, runs } from "@repo/db";
import { ACTIVE_STEP_STATUSES, releaseReadyJoins } from "./joins";
import { standardRunOutcome } from "./run-status";

export type RunRow = typeof runs.$inferSelect;
export type RunMode = RunRow["mode"];
export type RunStatus = RunRow["status"];

export interface CreateRunInput {
  userId: number;
  mode: RunMode;
  state: string;
  startTaskId: number | null;
  startTaskSnapshot?: unknown;
  parentRunId?: string | null;
}

/** Creates the run row that owns a chain of queued steps. */
export async function createRun(input: CreateRunInput): Promise<RunRow> {
  const [run] = await db
    .insert(runs)
    .values({
      userId: input.userId,
      mode: input.mode,
      status: "running",
      state: input.state,
      startTaskId: input.startTaskId,
      startTaskSnapshot: input.startTaskSnapshot ?? null,
      parentRunId: input.parentRunId ?? null,
    })
    .returning();

  if (!run) throw new Error("failed to create run");
  return run;
}

export async function getRun(runId: string): Promise<RunRow | undefined> {
  return db.query.runs.findFirst({ where: { id: runId } });
}

export async function setRunStatus(
  runId: string,
  status: RunStatus,
): Promise<void> {
  // Terminal states are final. An in-flight attempt may finish after the user
  // cancels the run; without this guard it would overwrite "cancelled" with
  // "awaiting_step_review" and make the cancelled run reappear as active.
  await db
    .update(runs)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(runs.id, runId),
        notInArray(runs.status, ["completed", "cancelled", "failed"]),
      ),
    );
}

/**
 * Ends a run when it has no active steps left. Used after accepting a step
 * whose outcome has no next task.
 */
export async function completeRunIfIdle(runId: string): Promise<boolean> {
  // A join barrier may have become ready after the last branch finished. Move
  // it to the queue before deciding whether the run is idle.
  await releaseReadyJoins(runId);

  const [active] = await db
    .select({ id: queuedTasks.id })
    .from(queuedTasks)
    .where(
      and(
        eq(queuedTasks.runId, runId),
        inArray(queuedTasks.status, [...ACTIVE_STEP_STATUSES]),
      ),
    )
    .limit(1);

  if (active) return false;
  await setRunStatus(runId, "completed");
  return true;
}

/**
 * Settles a standard run once every step has reached a terminal state. A
 * failed step that was not retried marks the run failed; otherwise it
 * completed. Assisted runs keep their review statuses and are ignored.
 */
export async function settleStandardRunIfIdle(
  runId: string,
): Promise<RunStatus | null> {
  // Release any join barrier whose branches just finished. This is the central
  // hook so every enqueue/finish path gets the same behaviour.
  await releaseReadyJoins(runId);

  const [active] = await db
    .select({ id: queuedTasks.id })
    .from(queuedTasks)
    .where(
      and(
        eq(queuedTasks.runId, runId),
        inArray(queuedTasks.status, [...ACTIVE_STEP_STATUSES]),
      ),
    )
    .limit(1);

  if (active) return null;

  const failed = await db
    .select({ result: queuedTasks.result })
    .from(queuedTasks)
    .where(
      and(eq(queuedTasks.runId, runId), eq(queuedTasks.status, "failed")),
    );

  const status: RunStatus = standardRunOutcome(
    failed.map((row) => row.result),
  );

  const updated = await db
    .update(runs)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(runs.id, runId),
        eq(runs.mode, "standard"),
        eq(runs.status, "running"),
      ),
    )
    .returning({ id: runs.id });

  return updated.length > 0 ? status : null;
}

/** Reopens a failed/completed standard run for a retried step. */
export async function reopenStandardRun(runId: string): Promise<void> {
  await db
    .update(runs)
    .set({ status: "running", updatedAt: new Date() })
    .where(and(eq(runs.id, runId), eq(runs.mode, "standard")));
}

/**
 * Settles standard runs that predate lifecycle tracking (or crashed before
 * their final step settled). Active runs are left alone.
 */
export async function settleIdleStandardRuns(): Promise<number> {
  const candidates = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.mode, "standard"), eq(runs.status, "running")));

  let settled = 0;
  for (const run of candidates) {
    if (await settleStandardRunIfIdle(run.id)) settled += 1;
  }
  return settled;
}
