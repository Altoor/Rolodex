import { and, eq, ne, sql } from "drizzle-orm";
// `sql` is used by the attempt-number aggregate below.
import {
  db,
  decisions,
  stepAttempts,
  taskResults,
  userDecisionOptions,
} from "@repo/db";
import type { QueuedRow, TaskRow } from "../queue/types";

export type AttemptRow = typeof stepAttempts.$inferSelect;
export type AttemptKind = AttemptRow["kind"];
export type AttemptStatus = AttemptRow["status"];

export interface TaskSnapshot {
  task: TaskRow;
  decision: typeof decisions.$inferSelect | null;
  results: (typeof taskResults.$inferSelect)[];
  userDecisionOptions: (typeof userDecisionOptions.$inferSelect)[];
}

/** Loads everything needed to execute a step without reading live rows. */
export async function loadTaskSnapshot(
  task: TaskRow,
): Promise<TaskSnapshot> {
  const [decision, results, options] = await Promise.all([
    task.decisionId != null
      ? db.query.decisions.findFirst({ where: { id: task.decisionId } })
      : Promise.resolve(undefined),
    db.query.taskResults.findMany({ where: { taskId: task.id } }),
    db.query.userDecisionOptions.findMany({ where: { taskId: task.id } }),
  ]);

  return {
    task,
    decision: decision ?? null,
    results: (results ?? []).sort((a, b) => a.id - b.id),
    userDecisionOptions: (options ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    ),
  };
}

export interface CreateAttemptInput {
  row: QueuedRow;
  snapshot: TaskSnapshot;
  kind?: AttemptKind;
  revision?: unknown;
  cause?: string;
}

export async function createAttempt({
  row,
  snapshot,
  kind = "initial",
  revision,
  cause,
}: CreateAttemptInput): Promise<AttemptRow> {
  const [current] = await db
    .select({
      number: sql<number>`coalesce(max(${stepAttempts.attemptNumber}), 0)`,
    })
    .from(stepAttempts)
    .where(eq(stepAttempts.queuedTaskId, row.id));

  const [attempt] = await db
    .insert(stepAttempts)
    .values({
      queuedTaskId: row.id,
      runId: row.runId,
      attemptNumber: Number(current?.number ?? 0) + 1,
      kind,
      status: "running",
      taskSnapshot: snapshot as unknown as Record<string, unknown>,
      beforeState: row.state,
      beforeToolState: row.toolState,
      revision: revision ?? null,
      cause: cause ?? null,
    })
    .returning();

  if (!attempt) throw new Error("failed to create step attempt");
  return attempt;
}

export async function finishAttempt(
  attemptId: number,
  input: {
    status: AttemptStatus;
    afterState?: string | null;
    afterToolState?: unknown;
    result?: unknown;
    effectJournal?: unknown;
    workspaceKey?: string | null;
  },
): Promise<AttemptRow> {
  const [attempt] = await db
    .update(stepAttempts)
    .set({
      status: input.status,
      afterState: input.afterState ?? null,
      afterToolState: input.afterToolState ?? null,
      result: input.result ?? null,
      effectJournal: input.effectJournal ?? null,
      workspaceKey: input.workspaceKey ?? null,
      finishedAt: new Date(),
    })
    .where(eq(stepAttempts.id, attemptId))
    .returning();

  if (!attempt) throw new Error(`attempt ${attemptId} not found`);
  return attempt;
}

export async function markAttemptCommitted(
  attemptId: number,
): Promise<boolean> {
  const rows = await db
    .update(stepAttempts)
    .set({
      status: "committed",
      committedAt: new Date(),
      review: { accepted: true, reviewedAt: new Date().toISOString() },
    })
    .where(
      and(
        eq(stepAttempts.id, attemptId),
        ne(stepAttempts.status, "committed"),
      ),
    )
    .returning({ id: stepAttempts.id });

  return rows.length > 0;
}

export async function getAttempt(
  attemptId: number,
): Promise<AttemptRow | undefined> {
  return db.query.stepAttempts.findFirst({ where: { id: attemptId } });
}

/** True when no newer attempt exists for the same queued step. */
export async function isLatestAttempt(
  attempt: Pick<AttemptRow, "queuedTaskId" | "attemptNumber">,
): Promise<boolean> {
  const [row] = await db
    .select({
      latest: sql<number>`coalesce(max(${stepAttempts.attemptNumber}), 0)`,
    })
    .from(stepAttempts)
    .where(eq(stepAttempts.queuedTaskId, attempt.queuedTaskId));
  return Number(row?.latest ?? 0) === attempt.attemptNumber;
}

/**
 * Retires an attempt that a revision or optimization replaced. Cancelled
 * attempts are never acceptable; the trial workspace is discarded separately.
 */
export async function supersedeAttempt(
  attemptId: number,
  reason: string,
): Promise<void> {
  await db
    .update(stepAttempts)
    .set({
      status: "cancelled",
      finishedAt: new Date(),
      review: {
        superseded: true,
        reason,
        reviewedAt: new Date().toISOString(),
      },
    })
    .where(
      and(
        eq(stepAttempts.id, attemptId),
        ne(stepAttempts.status, "committed"),
      ),
    );
}

/** Task row reconstructed from a snapshot, for a revised execution. */
export function taskFromSnapshot(snapshot: TaskSnapshot): TaskRow {
  return snapshot.task;
}


export { persistSnapshot } from "./persist-snapshot";
