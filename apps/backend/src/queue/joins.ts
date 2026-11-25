import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, queuedTasks, tasks } from "@repo/db";
import type { ToolForkContext } from "@repo/tools";
import { publishQueuedTaskEvent } from "./pubsub";
import type { QueuedRow } from "./types";

/** Statuses that mean a step has not finished yet. */
export const ACTIVE_STEP_STATUSES = [
  "queued",
  "running",
  "awaiting_input",
  "waiting",
] as const;

export type ForkFields = Pick<
  QueuedRow,
  "forkGroupId" | "forkIndex" | "isJoin"
>;

/** Generates the shared id for one foreach fan-out and its join barrier. */
export function newForkGroupId(): string {
  return randomUUID();
}

/**
 * Fork lineage inherited by a continuation step. A join's own continuation is
 * after the fan-in, so it deliberately drops the group.
 */
export function inheritedForkFields(row: ForkFields): {
  forkGroupId?: string;
  forkIndex?: number;
} {
  if (row.isJoin || row.forkGroupId == null) return {};
  return {
    forkGroupId: row.forkGroupId,
    forkIndex: row.forkIndex ?? undefined,
  };
}

/**
 * Moves every waiting join whose branches are all terminal to `queued`.
 * Called from the run settlement paths so no individual enqueue site can
 * forget to release a barrier.
 */
export async function releaseReadyJoins(runId?: string): Promise<number> {
  const conditions = [
    eq(queuedTasks.status, "waiting"),
    eq(queuedTasks.isJoin, true),
  ];
  if (runId) conditions.push(eq(queuedTasks.runId, runId));

  const joins = await db
    .select()
    .from(queuedTasks)
    .where(and(...conditions));

  let released = 0;

  for (const join of joins) {
    if (!join.forkGroupId) continue;

    const [active] = await db
      .select({ id: queuedTasks.id })
      .from(queuedTasks)
      .where(
        and(
          eq(queuedTasks.forkGroupId, join.forkGroupId),
          eq(queuedTasks.isJoin, false),
          inArray(queuedTasks.status, [...ACTIVE_STEP_STATUSES]),
        ),
      )
      .limit(1);

    if (active) continue;

    const [updated] = await db
      .update(queuedTasks)
      .set({ status: "queued" })
      .where(
        and(eq(queuedTasks.id, join.id), eq(queuedTasks.status, "waiting")),
      )
      .returning();

    if (updated) {
      released += 1;
      publishQueuedTaskEvent({
        queuedTask: updated,
        message: "all foreach branches finished — starting join task",
      });
    }
  }

  if (released > 0) {
    // A release often happens while the queue loop is already draining the
    // last branch. Wake it up so it cannot exit between that branch finishing
    // and the join becoming runnable. Dynamic import avoids a module cycle
    // through run-store.
    const { triggerQueue } = await import("./processor");
    triggerQueue();
  }

  return released;
}

/**
 * Loads every branch of a join's fork group. Branches are ordered by their
 * per-item ordinal, then by chain depth, so the last terminal row of each
 * index is that branch's outcome.
 */
export async function loadJoinBranches(
  row: QueuedRow,
): Promise<ToolForkContext | undefined> {
  if (!row.isJoin || !row.forkGroupId) return undefined;

  const rows = await db
    .select({ step: queuedTasks, taskName: tasks.name })
    .from(queuedTasks)
    .leftJoin(tasks, eq(queuedTasks.taskId, tasks.id))
    .where(
      and(
        eq(queuedTasks.forkGroupId, row.forkGroupId),
        eq(queuedTasks.isJoin, false),
      ),
    )
    .orderBy(
      asc(queuedTasks.forkIndex),
      asc(queuedTasks.depth),
      asc(queuedTasks.id),
    );

  const byIndex = new Map<number, typeof rows>();
  for (const entry of rows) {
    const index = entry.step.forkIndex ?? byIndex.size;
    const group = byIndex.get(index) ?? [];
    group.push(entry);
    byIndex.set(index, group);
  }

  const branches = [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([index, group]) => {
      const terminal = group.filter(
        (entry) =>
          entry.step.status === "completed" || entry.step.status === "failed",
      );
      const last = terminal.at(-1) ?? group.at(-1);
      if (!last) return [];

      return [
        {
          index,
          queuedTaskId: last.step.id,
          taskId: last.step.taskId,
          taskName: last.taskName ?? null,
          status:
            last.step.status === "failed"
              ? ("failed" as const)
              : ("completed" as const),
          result: last.step.result,
          toolState: last.step.toolState ?? [],
          state: last.step.state,
        },
      ];
    });

  return { groupId: row.forkGroupId, branches };
}
