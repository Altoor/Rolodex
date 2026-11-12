import { and, asc, eq } from "drizzle-orm";
import { db, queuedTasks } from "@repo/db";
import { publishQueuedTaskEvent } from "./pubsub";
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

/** Next queued step in FIFO order, or undefined when the queue is empty. */
export async function findNextQueuedStep(): Promise<QueuedRow | undefined> {
  // Plain select on purpose: in drizzle-orm 1.0.0-rc, relational queries with
  // a filter on a pgEnum column crash with "Unknown relational filter field:
  // decoder".
  const [row] = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.status, "queued"))
    .orderBy(asc(queuedTasks.queued_at), asc(queuedTasks.id))
    .limit(1);
  return row;
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
  id: number,
  taskName: string,
): Promise<QueuedRow | undefined> {
  const [running] = await db
    .update(queuedTasks)
    .set({ status: "running" })
    .where(eq(queuedTasks.id, id))
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
  const [updated] = await db
    .update(queuedTasks)
    .set({ status, result })
    .where(eq(queuedTasks.id, id))
    .returning();
  if (updated)
    publish(updated, message ?? (result as { note?: string })?.note ?? status);
}

export async function enqueueStep(
  values: typeof queuedTasks.$inferInsert,
): Promise<void> {
  if (values.runId && dismissedRuns.has(values.runId)) return;
  await db.insert(queuedTasks).values(values);
}

export async function enqueueSteps(
  values: (typeof queuedTasks.$inferInsert)[],
): Promise<number[]> {
  const active = values.filter(
    (value) => !value.runId || !dismissedRuns.has(value.runId),
  );
  if (active.length === 0) return [];
  const inserted = await db
    .insert(queuedTasks)
    .values(active)
    .returning({ id: queuedTasks.id });
  return inserted.map((child) => child.id);
}

export function publish(row: QueuedRow, message: string): void {
  publishQueuedTaskEvent({ queuedTask: row, message });
}
