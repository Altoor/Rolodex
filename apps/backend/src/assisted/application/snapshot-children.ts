import { and, eq, notInArray } from "drizzle-orm";
import { db, taskResults, userDecisionOptions } from "@repo/db";
import {
  asBoolean,
  asNumber,
  asString,
  type SnapshotRecord,
} from "./snapshot-record";

/** Applies builder results/options to a task, keeping the row ids stable. */
export async function syncSnapshotChildren(
  taskId: number,
  snapshot: SnapshotRecord,
): Promise<void> {
  const resultRows = Array.isArray(snapshot.results)
    ? (snapshot.results as SnapshotRecord[])
    : undefined;

  if (resultRows) {
    const keptIds: number[] = [];
    for (const row of resultRows) {
      const type = asString(row.type);
      const values: typeof taskResults.$inferInsert = {
        taskId,
        type:
          type === "noul" || type === "score" ? type : ("choice" as const),
        option: asString(row.option),
        scoreThreshold: asNumber(row.scoreThreshold),
        probabilityThreshold: asNumber(row.probabilityThreshold),
        confidenceThreshold: asNumber(row.confidenceThreshold),
        resultTaskId: asNumber(row.resultTaskId),
        appendState: asBoolean(row.appendState, false),
      };

      const id = asNumber(row.id);
      if (id != null && id > 0) {
        const [updated] = await db
          .update(taskResults)
          .set(values)
          .where(and(eq(taskResults.id, id), eq(taskResults.taskId, taskId)))
          .returning({ id: taskResults.id });
        if (updated) {
          keptIds.push(updated.id);
          continue;
        }
      }

      // A client-supplied id that belongs to another task is treated as new.
      const [created] = await db
        .insert(taskResults)
        .values(values)
        .returning({ id: taskResults.id });
      if (created) keptIds.push(created.id);
    }

    await db
      .delete(taskResults)
      .where(
        keptIds.length > 0
          ? and(
              eq(taskResults.taskId, taskId),
              notInArray(taskResults.id, keptIds),
            )
          : eq(taskResults.taskId, taskId),
      );
  }

  const optionRows = Array.isArray(snapshot.userDecisionOptions)
    ? (snapshot.userDecisionOptions as SnapshotRecord[])
    : undefined;

  if (optionRows) {
    const keptIds: number[] = [];
    for (const row of optionRows) {
      const kind = asString(row.kind);
      let selector: unknown = null;
      if (row.selector && typeof row.selector === "object") {
        selector = row.selector;
      } else if (typeof row.selectorText === "string" && row.selectorText.trim()) {
        try {
          selector = JSON.parse(row.selectorText);
        } catch {
          selector = null;
        }
      }

      const values = {
        taskId,
        kind: kind === "dynamic" ? ("dynamic" as const) : ("static" as const),
        label: asString(row.label),
        description: asString(row.description),
        value: asString(row.value),
        selector,
        labelPath: asString(row.labelPath),
        descriptionPath: asString(row.descriptionPath),
        valuePath: asString(row.valuePath),
        resultTaskId: asNumber(row.resultTaskId),
        appendState: asBoolean(row.appendState, false),
        sortOrder: asNumber(row.sortOrder) ?? 0,
      };

      const id = asNumber(row.id);
      if (id != null && id > 0) {
        const [updated] = await db
          .update(userDecisionOptions)
          .set(values)
          .where(
            and(
              eq(userDecisionOptions.id, id),
              eq(userDecisionOptions.taskId, taskId),
            ),
          )
          .returning({ id: userDecisionOptions.id });
        if (updated) {
          keptIds.push(updated.id);
          continue;
        }
      }

      // A client-supplied id that belongs to another task is treated as new.
      const [created] = await db
        .insert(userDecisionOptions)
        .values(values)
        .returning({ id: userDecisionOptions.id });
      if (created) keptIds.push(created.id);
    }

    await db
      .delete(userDecisionOptions)
      .where(
        keptIds.length > 0
          ? and(
              eq(userDecisionOptions.taskId, taskId),
              notInArray(userDecisionOptions.id, keptIds),
            )
          : eq(userDecisionOptions.taskId, taskId),
      );
  }
}
