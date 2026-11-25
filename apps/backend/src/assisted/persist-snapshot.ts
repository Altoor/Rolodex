import { GraphQLError } from "graphql";
import { and, eq, notInArray } from "drizzle-orm";
import {
  db,
  decisions,
  taskResults,
  tasks,
  userDecisionOptions,
} from "@repo/db";
import { inspectGraph, RevisionGraphError } from "./graph-safety";
import {
  assertTasksVisible,
  visibleTaskCondition,
} from "../schema/task/task/task-visibility";
import type { TaskSnapshot } from "./attempts";

/**
 * Persists an accepted snapshot. This is the only place assisted steps change
 * task/decision definitions; rejected attempts never call it.
 *
 * Client-supplied row ids are never trusted on their own: writes are scoped to
 * the snapshot's task, and any id that does not belong to it is inserted as a
 * new row. The result graph is validated before anything is written.
 */
export async function persistSnapshot(
  snapshot: TaskSnapshot,
  userId: number,
): Promise<{ resultIdMap: Map<number, number> }> {
  const task = snapshot.task;
  // Snapshot-only rows use negative ids; callers need the persisted ids to
  // refer to the rows they just selected.
  const resultIdMap = new Map<number, number>();

  const [liveTask] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, task.id), visibleTaskCondition(userId)))
    .limit(1);
  if (!liveTask) {
    throw new GraphQLError("Task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const references = [
    task.fallbackTaskId,
    task.onTrueTaskId,
    task.onFalseTaskId,
    task.joinTaskId,
    ...snapshot.results.map((row) => row.resultTaskId),
    ...snapshot.userDecisionOptions.map((row) => row.resultTaskId),
  ];
  await assertTasksVisible(userId, references);

  // A snapshot must not introduce a loop or dead-end in the live flow.
  try {
    await inspectGraph(
      [
        task.fallbackTaskId,
        task.onTrueTaskId,
        task.onFalseTaskId,
        ...snapshot.results.map((row) => row.resultTaskId),
        ...snapshot.userDecisionOptions.map((row) => row.resultTaskId),
      ].filter((value): value is number => typeof value === "number"),
      new Set([task.id]),
    );
  } catch (err) {
    if (err instanceof RevisionGraphError) {
      throw new GraphQLError(err.message, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    throw err;
  }

  // Only the decision currently attached to this task may be updated. A
  // snapshot that names any other decision gets a private copy instead of
  // rewriting someone else's row.
  let decisionId: number | null = null;
  if (snapshot.decision) {
    const decision = snapshot.decision;
    const canUpdate =
      decision.id >= 0 && liveTask.decisionId === decision.id;

    if (canUpdate) {
      decisionId = decision.id;
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
    } else {
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
      joinTaskId: task.joinTaskId,
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
    .where(and(eq(tasks.id, task.id), visibleTaskCondition(userId)));

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
      const [updated] = await db
        .update(taskResults)
        .set(values)
        .where(
          and(eq(taskResults.id, row.id), eq(taskResults.taskId, task.id)),
        )
        .returning({ id: taskResults.id });
      if (updated) {
        keptResultIds.push(updated.id);
        continue;
      }
    }

    const [created] = await db
      .insert(taskResults)
      .values(values)
      .returning({ id: taskResults.id });
    if (created) {
      keptResultIds.push(created.id);
      resultIdMap.set(row.id, created.id);
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
      const [updated] = await db
        .update(userDecisionOptions)
        .set(values)
        .where(
          and(
            eq(userDecisionOptions.id, row.id),
            eq(userDecisionOptions.taskId, task.id),
          ),
        )
        .returning({ id: userDecisionOptions.id });
      if (updated) {
        keptOptionIds.push(updated.id);
        continue;
      }
    }

    const [created] = await db
      .insert(userDecisionOptions)
      .values(values)
      .returning({ id: userDecisionOptions.id });
    if (created) keptOptionIds.push(created.id);
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

  return { resultIdMap };
}
