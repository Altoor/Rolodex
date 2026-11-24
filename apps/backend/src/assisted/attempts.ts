import { and, eq, ne, notInArray, sql } from "drizzle-orm";
// `sql` is used by the attempt-number aggregate below.
import {
  db,
  decisions,
  stepAttempts,
  taskResults,
  tasks,
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
): Promise<void> {
  await db
    .update(stepAttempts)
    .set({
      status: "committed",
      committedAt: new Date(),
      review: { accepted: true, reviewedAt: new Date().toISOString() },
    })
    .where(eq(stepAttempts.id, attemptId));
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

export async function loadTaskRow(taskId: number): Promise<TaskRow | undefined> {
  return db.query.tasks.findFirst({ where: { id: taskId } });
}

/**
 * Persists an accepted snapshot. This is the only place assisted steps change
 * task/decision definitions; rejected attempts never call it.
 */
export async function persistSnapshot(
  snapshot: TaskSnapshot,
  userId: number,
): Promise<{ resultIdMap: Map<number, number> }> {
  const task = snapshot.task;
  // Snapshot-only rows use negative ids; callers need the persisted ids to
  // refer to the rows they just selected.
  const resultIdMap = new Map<number, number>();

  let decisionId = task.decisionId;
  if (snapshot.decision && snapshot.decision.id < 0) {
    const decision = snapshot.decision;
    const [created] = await db
      .insert(decisions)
      .values({
        name: decision.name,
        type: decision.type,
        decisionPremise: decision.decisionPremise,
        instruction: decision.instruction,
        options: decision.options,
        optionDescriptions: decision.optionDescriptions,
        authorId: userId,
      })
      .returning({ id: decisions.id });
    if (!created) throw new Error("failed to persist decision");
    decisionId = created.id;
  }

  await db
    .update(tasks)
    .set({
      name: task.name,
      type: task.type,
      decisionId,
      fallbackTaskId: task.fallbackTaskId,
      toolKey: task.toolKey,
      toolConfig: task.toolConfig,
      toolOutputType: task.toolOutputType,
      onTrueTaskId: task.onTrueTaskId,
      onFalseTaskId: task.onFalseTaskId,
      model: task.model,
      decisionModel: task.decisionModel,
      decisionStateConfig: task.decisionStateConfig,
      forceUserDecideIfNoMatch: task.forceUserDecideIfNoMatch,
      userDecisionType: task.userDecisionType,
      userDecisionConfig: task.userDecisionConfig,
      canRunInParallel: task.canRunInParallel,
      prioritize: task.prioritize,
      isDraft: false,
      draftOwnerId: null,
    })
    .where(eq(tasks.id, task.id));

  if (snapshot.decision && snapshot.decision.id >= 0) {
    const decision = snapshot.decision;
    await db
      .update(decisions)
      .set({
        name: decision.name,
        type: decision.type,
        decisionPremise: decision.decisionPremise,
        instruction: decision.instruction,
        options: decision.options,
        optionDescriptions: decision.optionDescriptions,
      })
      .where(eq(decisions.id, decision.id));
  }

  const keptResultIds: number[] = [];
  for (const row of snapshot.results) {
    const values: typeof taskResults.$inferInsert = {
      taskId: task.id,
      type: row.type,
      option: row.option,
      scoreThreshold: row.scoreThreshold,
      probabilityThreshold: row.probabilityThreshold,
      confidenceThreshold: row.confidenceThreshold,
      resultTaskId: row.resultTaskId,
      appendState: row.appendState,
    };
    if (row.id > 0) {
      await db
        .update(taskResults)
        .set(values)
        .where(eq(taskResults.id, row.id));
      keptResultIds.push(row.id);
    } else {
      const [created] = await db
        .insert(taskResults)
        .values(values)
        .returning({ id: taskResults.id });
      if (created) {
        keptResultIds.push(created.id);
        resultIdMap.set(row.id, created.id);
      }
    }
  }
  await db
    .delete(taskResults)
    .where(
      keptResultIds.length > 0
        ? and(
            eq(taskResults.taskId, task.id),
            notInArray(taskResults.id, keptResultIds),
          )
        : eq(taskResults.taskId, task.id),
    );

  const keptOptionIds: number[] = [];
  for (const row of snapshot.userDecisionOptions) {
    const values: typeof userDecisionOptions.$inferInsert = {
      taskId: task.id,
      kind: row.kind,
      label: row.label,
      description: row.description,
      value: row.value,
      selector: row.selector,
      labelPath: row.labelPath,
      descriptionPath: row.descriptionPath,
      valuePath: row.valuePath,
      resultTaskId: row.resultTaskId,
      appendState: row.appendState,
      sortOrder: row.sortOrder,
    };
    if (row.id > 0) {
      await db
        .update(userDecisionOptions)
        .set(values)
        .where(eq(userDecisionOptions.id, row.id));
      keptOptionIds.push(row.id);
    } else {
      const [created] = await db
        .insert(userDecisionOptions)
        .values(values)
        .returning({ id: userDecisionOptions.id });
      if (created) keptOptionIds.push(created.id);
    }
  }
  await db
    .delete(userDecisionOptions)
    .where(
      keptOptionIds.length > 0
        ? and(
            eq(userDecisionOptions.taskId, task.id),
            notInArray(userDecisionOptions.id, keptOptionIds),
          )
        : eq(userDecisionOptions.taskId, task.id),
    );

  // The draft owner is only used for visibility while the run is pending.
  void userId;

  return { resultIdMap };
}

export { tasks };
