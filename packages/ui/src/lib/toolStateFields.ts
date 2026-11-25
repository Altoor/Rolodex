import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";

type QueryTask = NonNullable<GetTasksQuery["tasks"]>[number];

export type FlowTask = QueryTask & { id: number };

export type TaskState = Map<string, { taskId: number; taskName: string }>;

export const TODO_FIELDS = [
  "id",
  "name",
  "description",
  "done",
  "doByDate",
  "createdAt",
  "archivedAt",
  "score",
] as const;

export const FILE_FIELDS = [
  "id",
  "kind",
  "name",
  "description",
  "path",
  "parentId",
  "fileType",
  "mimeType",
  "size",
  "contentHash",
  "lastEditedAt",
  "filesystemModifiedAt",
  "createdAt",
  "updatedAt",
  "deletedAt",
] as const;

export const SCAN_CHANGE_FIELDS = [
  "kind",
  "change",
  "id",
  "name",
  "path",
  "fromPath",
  "fileType",
  "mimeType",
  "size",
  "lastEditedAt",
  "filesystemModifiedAt",
  "contentHash",
] as const;

export const SCAN_COUNT_FIELDS = [
  "added",
  "changed",
  "moved",
  "deleted",
  "unchanged",
] as const;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function addPath(
  state: TaskState,
  path: string,
  task: FlowTask,
  taskName: string,
): void {
  if (!state.has(path)) {
    state.set(path, { taskId: task.id, taskName });
  }
}

export function addObjectPaths(
  state: TaskState,
  prefix: string,
  fields: readonly string[],
  task: FlowTask,
  taskName: string,
): void {
  addPath(state, prefix, task, taskName);
  for (const field of fields) {
    addPath(state, `${prefix}.${field}`, task, taskName);
  }
}

export function addFields(
  state: TaskState,
  fields: readonly string[],
  task: FlowTask,
  taskName: string,
): void {
  for (const field of fields) addPath(state, field, task, taskName);
}

/** Field names declared by a prompt task's `fields` config object. */
export function promptFieldNames(
  config: Record<string, unknown> | null,
): string[] {
  const fields = asRecord(config?.fields);
  if (!fields) return [];

  return Object.keys(fields).filter((name) => name.trim().length > 0);
}

/** Reads prompt field names from the task builder's raw config JSON. */
export function promptFieldNamesFromText(configText: string): string[] {
  if (!configText.trim()) return [];

  try {
    return promptFieldNames(asRecord(JSON.parse(configText)));
  } catch {
    return [];
  }
}

export function addTodoPaths(
  state: TaskState,
  prefix: string,
  task: FlowTask,
  taskName: string,
): void {
  addObjectPaths(state, prefix, TODO_FIELDS, task, taskName);
}

/**
 * Adds an array and its first item's fields. `todos.0.name` is the
 * entry-relative form used when no `path` selector is set, while `todos` can
 * be used as the `path` selector itself.
 */
export function addArrayPaths(
  state: TaskState,
  prefix: string,
  fields: readonly string[],
  task: FlowTask,
  taskName: string,
): void {
  addPath(state, prefix, task, taskName);
  addPath(state, `${prefix}.0`, task, taskName);
  for (const field of fields) {
    addPath(state, `${prefix}.0.${field}`, task, taskName);
  }
}

export function addDecisionPaths(
  state: TaskState,
  task: FlowTask,
  taskName: string,
): void {
  addObjectPaths(
    state,
    "decision",
    [
      "type",
      "choice",
      "confidence",
      "score",
      "noul",
      "selectedResultId",
      "probabilities",
    ],
    task,
    taskName,
  );
}
