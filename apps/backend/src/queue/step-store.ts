import { and, asc, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db, queuedTasks, runs, tasks } from "@repo/db";
import { publishQueuedTaskEvent } from "./pubsub";
import { warmQueuedRows } from "./model-warmup";
import type { QueuedRow } from "./types";

/**
 * Runs the user has dismissed. A step that was already executing when the run
 * was dismissed must not enqueue a continuation, otherwise the flow would
 * resume after the pending choice disappeared.
 */
const dismissedRuns = new Set<string>();

/** Marks a run as dismissed so in-flight steps cannot continue it. */
export function dismissRun(runId: string): void {
  dismissedRuns.add(runId);
}

/** Whether a run has been stopped and must not continue. */
export function isRunDismissed(runId: string): boolean {
  return dismissedRuns.has(runId);
}

export interface FindNextQueuedStepOptions {
  /** Only consider tasks allowed to run beside other steps. */
  onlyParallel?: boolean;
}

/**
 * Next queued step. Prioritized tasks come first, then parallel-capable tasks,
 * and within each group the oldest row wins. `onlyParallel` is used while
 * other steps are running, because exclusive tasks must not overlap them.
 */
export async function findNextQueuedStep(
  options: FindNextQueuedStepOptions = {},
): Promise<QueuedRow | undefined> {
  // Plain select on purpose: in drizzle-orm 1.0.0-rc, relational queries with
  // a filter on a pgEnum column crash with "Unknown relational filter field:
  // decoder".
  const conditions = [eq(queuedTasks.status, "queued")];
  if (options.onlyParallel) {
    // Assisted runs are always sequential: only a standard step may run
    // beside other work.
    conditions.push(eq(tasks.canRunInParallel, true));
    conditions.push(eq(runs.mode, "standard"));
  }
  // A run can be stopped between dismissing it and completing its rows.
  // Excluding it here avoids repeatedly handing the queue a row that
  // `claimStep` must refuse.
  if (dismissedRuns.size > 0) {
    conditions.push(notInArray(queuedTasks.runId, [...dismissedRuns]));
  }

  const [result] = await db
    .select({ row: queuedTasks })
    .from(queuedTasks)
    .leftJoin(tasks, eq(queuedTasks.taskId, tasks.id))
    .leftJoin(runs, eq(queuedTasks.runId, runs.id))
    .where(and(...conditions))
    .orderBy(
      desc(sql`coalesce(${tasks.prioritize}, false)`),
      desc(sql`coalesce(${tasks.canRunInParallel}, false)`),
      asc(queuedTasks.queued_at),
      asc(queuedTasks.id),
    )
    .limit(1);
  return result?.row;
}

/**
 * Whether a queued step must jump to the top of the queue but cannot overlap
 * running work. The processor stops starting parallel steps until the in-flight
 * ones drain so the prioritized exclusive step can run next.
 */
export async function hasPrioritizedExclusiveStep(): Promise<boolean> {
  const conditions = [
    eq(queuedTasks.status, "queued"),
    eq(tasks.prioritize, true),
    or(eq(tasks.canRunInParallel, false), eq(runs.mode, "assisted")),
  ];
  if (dismissedRuns.size > 0) {
    conditions.push(notInArray(queuedTasks.runId, [...dismissedRuns]));
  }

  const [result] = await db
    .select({ id: queuedTasks.id })
    .from(queuedTasks)
    .leftJoin(tasks, eq(queuedTasks.taskId, tasks.id))
    .leftJoin(runs, eq(queuedTasks.runId, runs.id))
    .where(and(...conditions))
    .limit(1);
  return result !== undefined;
}

/** Re-queues rows that were mid-run when the process stopped. */
export async function resetRunningSteps(): Promise<number> {
  const stale = await db
    .update(queuedTasks)
    .set({ status: "queued" })
    .where(eq(queuedTasks.status, "running"))
    .returning();
  return stale.length;
}

/** Marks a queued step as running and announces it. */
export async function claimStep(
  row: Pick<QueuedRow, "id" | "runId">,
  taskName: string,
): Promise<QueuedRow | undefined> {
  // A run may have been stopped after the step was picked from the queue but
  // before it was claimed. Do not start it, and do not revive a row that the
  // dismiss already completed.
  if (dismissedRuns.has(row.runId)) return undefined;

  const [running] = await db
    .update(queuedTasks)
    .set({ status: "running" })
    .where(and(eq(queuedTasks.id, row.id), eq(queuedTasks.status, "queued")))
    .returning();
  if (running) publish(running, `running task "${taskName}"`);
  return running;
}

/** Parks a running step until the user answers its pending choice. */
export async function awaitStep(
  id: number,
  pendingChoice: unknown,
  result: unknown,
  message = "waiting for user input",
): Promise<QueuedRow | undefined> {
  const [waiting] = await db
    .update(queuedTasks)
    .set({
      status: "awaiting_input",
      pendingChoice,
      result,
    })
    .where(and(eq(queuedTasks.id, id), eq(queuedTasks.status, "running")))
    .returning();

  if (waiting) publish(waiting, message);
  return waiting;
}

export async function finishStep(
  id: number,
  status: "completed" | "failed",
  result: unknown,
  message?: string,
): Promise<void> {
  // Finish a step that has not reached a terminal or parked state. Allowing
  // `queued` covers a row whose task vanished before it could be claimed; the
  // processor would otherwise pick that row forever because the failed update
  // never matched. A stop marks rows completed, which is still skipped here.
  const [updated] = await db
    .update(queuedTasks)
    .set({ status, result })
    .where(
      and(
        eq(queuedTasks.id, id),
        inArray(queuedTasks.status, ["queued", "running"]),
      ),
    )
    .returning();
  if (updated)
    publish(updated, message ?? (result as { note?: string })?.note ?? status);
}

/** Completes a step that was parked for assisted review. */
export async function completeReviewedStep(
  id: number,
  result: unknown,
  message?: string,
): Promise<QueuedRow | undefined> {
  const [updated] = await db
    .update(queuedTasks)
    .set({ status: "completed", result, pendingChoice: null })
    .where(
      and(eq(queuedTasks.id, id), eq(queuedTasks.status, "awaiting_input")),
    )
    .returning();

  if (updated)
    publish(updated, message ?? (result as { summary?: string })?.summary ?? "step accepted");
  return updated;
}

/**
 * Reopens a reviewed step so a revised attempt can run and park again. The
 * accepted/rejected state itself is tracked on the attempt, not the row.
 */
export async function resumeReviewedStep(
  id: number,
): Promise<QueuedRow | undefined> {
  const [updated] = await db
    .update(queuedTasks)
    .set({ status: "running", pendingChoice: null })
    .where(
      and(eq(queuedTasks.id, id), eq(queuedTasks.status, "awaiting_input")),
    )
    .returning();

  if (updated) publish(updated, "revising step");
  return updated;
}

export async function enqueueStep(
  values: typeof queuedTasks.$inferInsert,
): Promise<void> {
  if (values.runId && dismissedRuns.has(values.runId)) return;
  const [inserted] = await db.insert(queuedTasks).values(values).returning();
  if (inserted) void warmQueuedRows([inserted]);
}

export async function enqueueSteps(
  values: (typeof queuedTasks.$inferInsert)[],
): Promise<number[]> {
  const active = values.filter(
    (value) => !value.runId || !dismissedRuns.has(value.runId),
  );
  if (active.length === 0) return [];
  const inserted = await db.insert(queuedTasks).values(active).returning();
  void warmQueuedRows(inserted);
  return inserted.map((child) => child.id);
}

export function publish(row: QueuedRow, message: string): void {
  publishQueuedTaskEvent({ queuedTask: row, message });
}
