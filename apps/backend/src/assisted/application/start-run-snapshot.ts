import { GraphQLError } from "graphql";
import { inArray } from "drizzle-orm";
import { db, tasks } from "@repo/db";
import type { TaskRow } from "../../queue/types";
import type { TaskSnapshot } from "../attempts";
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  type SnapshotRecord,
} from "./snapshot-record";
import { syncSnapshotChildren } from "./snapshot-children";

export { asBoolean, asNumber, asRecord, asString, type SnapshotRecord };

export function taskSource(snapshot: SnapshotRecord): SnapshotRecord {
  const nested = snapshot.task;
  return nested && typeof nested === "object"
    ? (nested as SnapshotRecord)
    : snapshot;
}

/** Normalizes a builder snapshot into the columns we persist on `tasks`. */
export function taskValues(
  source: SnapshotRecord,
  task?: TaskRow,
): Partial<TaskRow> {
  const type = asString(source.type);
  const toolOutputType = asString(source.toolOutputType);
  const userDecisionType = asString(source.userDecisionType);

  return {
    name: asString(source.name) ?? task?.name ?? "Assisted draft",
    type:
      type === "tool" ||
      type === "decision" ||
      type === "userDecision" ||
      type === "textPrompt"
        ? type
        : (task?.type ?? "tool"),
    decisionId:
      asNumber(source.decisionId) ??
      (source.decisionId === null ? null : task?.decisionId ?? null),
    fallbackTaskId:
      source.fallbackTaskId === null
        ? null
        : asNumber(source.fallbackTaskId) ?? task?.fallbackTaskId ?? null,
    toolKey:
      source.toolKey === null ? null : asString(source.toolKey) ?? task?.toolKey ?? null,
    toolConfig:
      source.toolConfig === null
        ? null
        : source.toolConfig && typeof source.toolConfig === "object"
          ? (source.toolConfig as Record<string, unknown>)
          : (task?.toolConfig ?? null),
    toolOutputType:
      toolOutputType === "foreach" || toolOutputType === "normal"
        ? toolOutputType
        : (task?.toolOutputType ?? "normal"),
    onTrueTaskId:
      source.onTrueTaskId === null
        ? null
        : asNumber(source.onTrueTaskId) ?? task?.onTrueTaskId ?? null,
    onFalseTaskId:
      source.onFalseTaskId === null
        ? null
        : asNumber(source.onFalseTaskId) ?? task?.onFalseTaskId ?? null,
    joinTaskId:
      source.joinTaskId === null
        ? null
        : asNumber(source.joinTaskId) ?? task?.joinTaskId ?? null,
    model:
      source.model === null ? null : asString(source.model) ?? task?.model ?? null,
    decisionModel:
      source.decisionModel === null
        ? null
        : asString(source.decisionModel) ?? task?.decisionModel ?? null,
    decisionStateConfig:
      source.decisionStateConfig === null
        ? null
        : source.decisionStateConfig &&
            typeof source.decisionStateConfig === "object"
          ? (source.decisionStateConfig as Record<string, unknown>)
          : (task?.decisionStateConfig ?? null),
    forceUserDecideIfNoMatch: asBoolean(
      source.forceUserDecideIfNoMatch,
      task?.forceUserDecideIfNoMatch ?? true,
    ),
    userDecisionType:
      userDecisionType === "list" ||
      userDecisionType === "yesNo" ||
      userDecisionType === "dropdown"
        ? userDecisionType
        : (task?.userDecisionType ?? "list"),
    userDecisionConfig:
      source.userDecisionConfig === null
        ? null
        : source.userDecisionConfig &&
            typeof source.userDecisionConfig === "object"
          ? (source.userDecisionConfig as Record<string, unknown>)
          : (task?.userDecisionConfig ?? null),
    canRunInParallel: asBoolean(
      source.canRunInParallel,
      task?.canRunInParallel ?? false,
    ),
    prioritize: asBoolean(source.prioritize, task?.prioritize ?? false),
  };
}

/**
 * Creates a draft task from the builder snapshot. The draft is hidden from
 * normal task lists and promoted or deleted by the assisted run.
 */
export async function createDraftTask(
  userId: number,
  snapshot: SnapshotRecord,
): Promise<TaskRow> {
  const source = taskSource(snapshot);

  if (source.type === "decision" && !asNumber(source.decisionId)) {
    throw new GraphQLError(
      "Save a new decision task before running it as an assisted draft",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const [draft] = await db
    .insert(tasks)
    .values({
      ...(taskValues(source) as typeof tasks.$inferInsert),
      isDraft: true,
      draftOwnerId: userId,
    })
    .returning();

  if (!draft) throw new Error("failed to create draft task");
  await syncSnapshotChildren(draft.id, snapshot);
  return draft;
}

export function normalizeResult(
  row: SnapshotRecord,
  taskId: number,
  index: number,
): TaskSnapshot["results"][number] {
  const id = asNumber(row.id);
  const type = asString(row.type);
  return {
    // New builder rows use negative ids; persistSnapshot converts them.
    id: id != null && id > 0 ? id : -(index + 1),
    taskId,
    type: type === "noul" || type === "score" ? type : "choice",
    option: asString(row.option),
    scoreThreshold: asNumber(row.scoreThreshold),
    probabilityThreshold: asNumber(row.probabilityThreshold),
    confidenceThreshold: asNumber(row.confidenceThreshold),
    resultTaskId: asNumber(row.resultTaskId),
    appendState: asBoolean(row.appendState, false),
  };
}

export function normalizeOption(
  row: SnapshotRecord,
  taskId: number,
  index: number,
): TaskSnapshot["userDecisionOptions"][number] {
  const id = asNumber(row.id);
  const kind = asString(row.kind);
  let selector: unknown = row.selector ?? null;
  if (typeof row.selectorText === "string" && row.selectorText.trim()) {
    try {
      selector = JSON.parse(row.selectorText);
    } catch {
      selector = null;
    }
  }

  return {
    id: id != null && id > 0 ? id : -(index + 1),
    taskId,
    kind: kind === "dynamic" ? "dynamic" : "static",
    label: asString(row.label),
    description: asString(row.description),
    value: asString(row.value),
    selector,
    labelPath: asString(row.labelPath),
    descriptionPath: asString(row.descriptionPath),
    valuePath: asString(row.valuePath),
    resultTaskId: asNumber(row.resultTaskId),
    appendState: asBoolean(row.appendState, false),
    sortOrder: asNumber(row.sortOrder) ?? index,
  };
}

/**
 * Builds the transient snapshot the queue executes for the starting step. It
 * never writes to the saved task or decision: cancellation must leave both at
 * their last accepted state.
 */
