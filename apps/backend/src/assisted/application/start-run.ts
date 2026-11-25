import { GraphQLError } from "graphql";
import { inArray } from "drizzle-orm";
import { db, fileEntries, queuedTasks } from "@repo/db";
import { toFileEntryRef } from "@repo/tools/tools/file/services/dto";
import { assertTasksVisible } from "../../schema/task/task/task-visibility";
import { queueEvents } from "../../queue";
import { createRun } from "../../queue/run-store";
import type { TaskRow } from "../../queue/types";
import {
  loadTaskSnapshot,
  type TaskSnapshot,
} from "../attempts";
import {
  asRecord,
  asString,
  createDraftTask,
  normalizeOption,
  normalizeResult,
  snapshotReferences,
  taskSource,
  taskValues,
  type SnapshotRecord,
} from "./start-run-snapshot";

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

  // The starting snapshot may come from the client, so apply the draft rule to
  // every task it can branch to before the queue executes it.
  await assertTasksVisible(userId, snapshotReferences(snapshot));

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
