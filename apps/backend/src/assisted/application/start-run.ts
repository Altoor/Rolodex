import { GraphQLError } from "graphql";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import {
  db,
  fileEntries,
  queuedTasks,
  taskResults,
  tasks,
  userDecisionOptions,
} from "@repo/db";
import { toFileEntryRef } from "@repo/tools/tools/file/services/dto";
import { queueEvents } from "../../queue";
import { createRun } from "../../queue/run-store";
import type { TaskRow } from "../../queue/types";
import {
  loadTaskSnapshot,
  type TaskSnapshot,
} from "../attempts";

export interface StartAssistedRunInput {
  taskId?: number | null;
  /**
   * Current builder draft, in the same shape as the executable step snapshot
   * (`{ task, decision, results, userDecisionOptions }`). Sent when the form
   * has unsaved edits so the run matches what the builder shows.
   */
  taskSnapshot?: Record<string, unknown> | null;
  state: string;
  fileIds?: number[] | null;
  folderIds?: number[] | null;
}

type SnapshotRecord = Record<string, unknown>;

const asRecord = (value: unknown): SnapshotRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as SnapshotRecord)
    : {};

const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

function taskSource(snapshot: SnapshotRecord): SnapshotRecord {
  const nested = snapshot.task;
  return nested && typeof nested === "object"
    ? (nested as SnapshotRecord)
    : snapshot;
}

/** Normalizes a builder snapshot into the columns we persist on `tasks`. */
function taskValues(
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

/** Applies builder results/options to a task, keeping the row ids stable. */
async function syncSnapshotChildren(
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
        await db
          .update(taskResults)
          .set(values)
          .where(eq(taskResults.id, id));
        keptIds.push(id);
      } else {
        const [created] = await db
          .insert(taskResults)
          .values(values)
          .returning({ id: taskResults.id });
        if (created) keptIds.push(created.id);
      }
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
        await db
          .update(userDecisionOptions)
          .set(values)
          .where(eq(userDecisionOptions.id, id));
        keptIds.push(id);
      } else {
        const [created] = await db
          .insert(userDecisionOptions)
          .values(values)
          .returning({ id: userDecisionOptions.id });
        if (created) keptIds.push(created.id);
      }
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

/**
 * Creates a draft task from the builder snapshot. The draft is hidden from
 * normal task lists and promoted or deleted by the assisted run.
 */
async function createDraftTask(
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

function normalizeResult(
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

function normalizeOption(
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
async function buildSnapshotFromDraft(
  task: TaskRow,
  raw: SnapshotRecord,
): Promise<TaskSnapshot> {
  const source = taskSource(raw);
  const mergedTask = {
    ...task,
    ...taskValues(source, task),
    id: task.id,
  } as TaskRow;

  let decision =
    mergedTask.decisionId != null
      ? ((await db.query.decisions.findFirst({
          where: { id: mergedTask.decisionId },
        })) ?? null)
      : null;

  const builderDecision = asRecord(raw.decision);
  if (decision && Object.keys(builderDecision).length > 0) {
    const type = asString(builderDecision.type);
    decision = {
      ...decision,
      name: asString(builderDecision.name) ?? decision.name,
      type: type === "noul" || type === "score" ? type : decision.type,
      decisionPremise:
        asString(builderDecision.decisionPremise) ?? decision.decisionPremise,
      instruction:
        asString(builderDecision.instruction) ?? decision.instruction,
      options: Array.isArray(builderDecision.options)
        ? (builderDecision.options.filter(
            (entry): entry is string => typeof entry === "string",
          ) as string[])
        : decision.options,
      optionDescriptions: Array.isArray(builderDecision.optionDescriptions)
        ? (builderDecision.optionDescriptions.filter(
            (entry): entry is string => typeof entry === "string",
          ) as string[])
        : decision.optionDescriptions,
    };
  }

  const resultRows = Array.isArray(raw.results)
    ? (raw.results as SnapshotRecord[])
    : await db.query.taskResults.findMany({ where: { taskId: task.id } });
  const optionRows = Array.isArray(raw.userDecisionOptions)
    ? (raw.userDecisionOptions as SnapshotRecord[])
    : await db.query.userDecisionOptions.findMany({
        where: { taskId: task.id },
      });

  return {
    task: mergedTask,
    decision,
    results: resultRows.map((row, index) =>
      normalizeResult(row, task.id, index),
    ),
    userDecisionOptions: optionRows.map((row, index) =>
      normalizeOption(row, task.id, index),
    ),
  };
}

async function loadAttachments(
  ids: number[] | null | undefined,
  kind: "file" | "folder",
): Promise<Record<string, unknown>[]> {
  const unique = [...new Set((ids ?? []).filter((id) => id > 0))];
  if (unique.length === 0) return [];

  const rows = await db
    .select()
    .from(fileEntries)
    .where(inArray(fileEntries.id, unique));

  const wrong = rows.filter((row) => row.kind !== kind);
  if (wrong.length > 0) {
    throw new GraphQLError(`Expected ${kind} entries`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return unique.map((id) => {
    const row = rows.find((entry) => entry.id === id);
    if (!row) {
      throw new GraphQLError(`File entry ${id} not found`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    return toFileEntryRef(row) as unknown as Record<string, unknown>;
  });
}

export async function startAssistedRun(
  userId: number,
  input: StartAssistedRunInput,
) {
  if (!input.state.trim()) {
    throw new GraphQLError("Describe the situation before starting a run", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  let task: TaskRow | undefined;
  if (input.taskId != null) {
    task = await db.query.tasks.findFirst({ where: { id: input.taskId } });
    // Drafts belong to the user who is editing them; saved tasks are shared.
    if (!task || (task.isDraft && task.draftOwnerId !== userId)) {
      throw new GraphQLError("Task not found", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }

  // A supplied builder snapshot wins over the saved row so unsaved edits are
  // what actually runs. A saved task is left untouched until the first
  // attempt is accepted; only a brand-new task gets a hidden draft row.
  let snapshot: TaskSnapshot | undefined;
  if (input.taskSnapshot) {
    if (task) {
      snapshot = await buildSnapshotFromDraft(task, input.taskSnapshot);
    } else {
      task = await createDraftTask(userId, input.taskSnapshot);
      snapshot = await buildSnapshotFromDraft(task, input.taskSnapshot);
    }
  }

  if (!task) {
    throw new GraphQLError("Choose a starting task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  snapshot ??= await loadTaskSnapshot(task);

  if (snapshot.task.type === "decision" && snapshot.task.decisionId == null) {
    throw new GraphQLError(
      `Task "${snapshot.task.name}" is a decision task but has no decision attached. Choose or create a decision in the task builder, then run it again.`,
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const [files, folders] = await Promise.all([
    loadAttachments(input.fileIds, "file"),
    loadAttachments(input.folderIds, "folder"),
  ]);

  const toolState: Record<string, unknown>[] = [];
  if (files.length > 0 || folders.length > 0) {
    toolState.push({
      uploaded: true,
      ...(files.length > 0 ? { files } : {}),
      ...(folders.length > 0 ? { folders } : {}),
    });
  }

  const run = await createRun({
    userId,
    mode: "assisted",
    state: input.state,
    startTaskId: task.id,
    startTaskSnapshot: snapshot,
  });

  const [step] = await db
    .insert(queuedTasks)
    .values({
      taskId: task.id,
      state: input.state,
      toolState,
      depth: 0,
      runId: run.id,
      queued_by: userId,
      // Assisted runs are always sequential.
      model: snapshot.task.model,
      decisionModel: snapshot.task.decisionModel,
    })
    .returning();

  if (!step) throw new Error("failed to queue the assisted run");
  queueEvents.emit("queuedTask", {
    queuedTask: step,
    message: "assisted run queued",
  });

  // Imported lazily to avoid a module cycle between the application service
  // and the queue dispatcher.
  const { triggerQueue } = await import("../../queue/processor");
  triggerQueue();

  return run;
}
