import { GraphQLError } from "graphql";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  db,
  queuedTasks,
  runs,
  stepAttempts,
  taskResults,
  tasks,
  userDecisionOptions,
} from "@repo/db";
import { publish } from "../../queue/step-store";
import { setRunStatus } from "../../queue/run-store";
import { discardTrial, resumeTrial } from "../infrastructure/workspace";
import { recordTrace } from "../infrastructure/trace";

type QueuedStep = typeof queuedTasks.$inferSelect;

interface InsertedChain {
  previousFallback: number | null;
  insertedTaskIds: number[];
}

function readInsertedChain(result: unknown): InsertedChain | null {
  if (!result || typeof result !== "object") return null;
  const value = (result as { insertedChain?: unknown }).insertedChain;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const ids = Array.isArray(record.insertedTaskIds)
    ? record.insertedTaskIds.filter(
        (id): id is number => typeof id === "number",
      )
    : [];
  if (ids.length === 0) return null;
  return {
    previousFallback:
      typeof record.previousFallback === "number"
        ? record.previousFallback
        : null,
    insertedTaskIds: ids,
  };
}

async function draftTaskIds(
  steps: QueuedStep[],
  active: QueuedStep[],
): Promise<number[]> {
  const candidates = new Set<number>();
  for (const step of active) {
    if (step.taskId != null) candidates.add(step.taskId);
  }
  for (const step of steps) {
    for (const id of readInsertedChain(step.result)?.insertedTaskIds ?? []) {
      candidates.add(id);
    }
  }
  if (candidates.size === 0) return [];

  const drafts = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.isDraft, true), inArray(tasks.id, [...candidates])));
  return drafts.map((row) => row.id);
}

/**
 * Rebuilds the live after-chain around the drafts that are about to be
 * deleted, then removes any remaining references. Without this a cancelled
 * inserted chain can leave `fallbackTaskId` pointing at a deleted task.
 */
async function repairInsertedChains(
  steps: QueuedStep[],
  discarded: number[],
): Promise<void> {
  if (discarded.length === 0) return;
  const discardedIds = new Set(discarded);

  for (const step of steps) {
    const chain = readInsertedChain(step.result);
    if (!chain) continue;

    const surviving = chain.insertedTaskIds.filter(
      (id) => !discardedIds.has(id),
    );

    for (let index = 0; index < surviving.length; index += 1) {
      await db
        .update(tasks)
        .set({
          fallbackTaskId: surviving[index + 1] ?? chain.previousFallback,
        })
        .where(eq(tasks.id, surviving[index]!));
    }

    if (step.taskId != null) {
      await db
        .update(tasks)
        .set({
          fallbackTaskId: surviving[0] ?? chain.previousFallback,
        })
        .where(eq(tasks.id, step.taskId));
    }
  }
}

async function clearDanglingReferences(discarded: number[]): Promise<void> {
  if (discarded.length === 0) return;

  await db
    .update(tasks)
    .set({ fallbackTaskId: null })
    .where(inArray(tasks.fallbackTaskId, discarded));
  await db
    .update(tasks)
    .set({ onTrueTaskId: null })
    .where(inArray(tasks.onTrueTaskId, discarded));
  await db
    .update(tasks)
    .set({ onFalseTaskId: null })
    .where(inArray(tasks.onFalseTaskId, discarded));
  await db
    .update(taskResults)
    .set({ resultTaskId: null })
    .where(inArray(taskResults.resultTaskId, discarded));
  await db
    .update(userDecisionOptions)
    .set({ resultTaskId: null })
    .where(inArray(userDecisionOptions.resultTaskId, discarded));
}

async function loadOwnedRun(userId: number, runId: string) {
  const run = await db.query.runs.findFirst({ where: { id: runId } });
  if (!run || run.userId !== userId) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return run;
}

/**
 * Cancels an assisted run. Uncommitted attempts and their trial workspaces are
 * dropped; previously accepted steps stay. Draft tasks created only for this
 * run are deleted, and any live edges that pointed at them are repaired.
 */
export async function cancelAssistedRun(
  userId: number,
  runId: string,
): Promise<boolean> {
  await loadOwnedRun(userId, runId);

  const attempts = await db
    .select()
    .from(stepAttempts)
    .where(
      and(eq(stepAttempts.runId, runId), ne(stepAttempts.status, "committed")),
    );

  for (const attempt of attempts) {
    if (attempt.workspaceKey) {
      await discardTrial(await resumeTrial(runId, attempt.id)).catch(
        () => undefined,
      );
    }
  }

  const steps = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, runId));
  const active = steps.filter((step) =>
    ["queued", "running", "awaiting_input", "waiting"].includes(step.status),
  );

  for (const step of active) {
    const previous =
      typeof step.result === "object" && step.result !== null
        ? (step.result as Record<string, unknown>)
        : {};
    const [updated] = await db
      .update(queuedTasks)
      .set({
        status: "completed",
        pendingChoice: null,
        result: {
          ...previous,
          branch: "none",
          nextTaskId: null,
          dismissed: true,
          dismissedAt: new Date().toISOString(),
          summary: "Run cancelled by user",
        },
      })
      .where(eq(queuedTasks.id, step.id))
      .returning();
    if (updated) publish(updated, "run cancelled by user");
  }

  // Delete only uncommitted attempts; accepted history remains.
  await db
    .delete(stepAttempts)
    .where(
      and(eq(stepAttempts.runId, runId), ne(stepAttempts.status, "committed")),
    );

  const drafts = await draftTaskIds(steps, active);
  await repairInsertedChains(steps, drafts);
  await clearDanglingReferences(drafts);
  if (drafts.length > 0) {
    await db.delete(tasks).where(inArray(tasks.id, drafts));
  }

  await setRunStatus(runId, "cancelled");
  await recordTrace({
    runId,
    kind: "run.cancelled",
    payload: { cancelledBy: userId },
  });

  return true;
}

/** Hard-deletes a run, its steps, attempts, traces, and draft tasks. */
export async function deleteAssistedRun(
  userId: number,
  runId: string,
): Promise<boolean> {
  await loadOwnedRun(userId, runId);

  const attempts = await db
    .select()
    .from(stepAttempts)
    .where(eq(stepAttempts.runId, runId));

  for (const attempt of attempts) {
    if (attempt.workspaceKey) {
      await discardTrial(await resumeTrial(runId, attempt.id)).catch(
        () => undefined,
      );
    }
  }

  const steps = await db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, runId));

  const drafts = await draftTaskIds(steps, steps);
  await repairInsertedChains(steps, drafts);
  await clearDanglingReferences(drafts);

  await db.delete(queuedTasks).where(eq(queuedTasks.runId, runId));
  await db.delete(runs).where(eq(runs.id, runId));
  if (drafts.length > 0) {
    await db.delete(tasks).where(inArray(tasks.id, drafts));
  }

  return true;
}
