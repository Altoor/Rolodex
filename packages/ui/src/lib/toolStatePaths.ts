import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";

type QueryTask = NonNullable<GetTasksQuery["tasks"]>[number];

export type FlowTask = QueryTask & { id: number };

export interface ToolStatePathSuggestion {
  /** Dot path that can be dropped into a path/config field. */
  path: string;
  /** Task that contributes this value to toolState. */
  sourceTaskId: number;
  sourceTaskName: string;
}

type TaskState = Map<string, { taskId: number; taskName: string }>;

const TODO_FIELDS = [
  "id",
  "name",
  "description",
  "done",
  "doByDate",
  "createdAt",
  "archivedAt",
  "score",
] as const;

const FILE_FIELDS = [
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

const SCAN_CHANGE_FIELDS = [
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

const SCAN_COUNT_FIELDS = [
  "added",
  "changed",
  "moved",
  "deleted",
  "unchanged",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function addPath(
  state: TaskState,
  path: string,
  task: FlowTask,
  taskName: string,
): void {
  if (!state.has(path)) {
    state.set(path, { taskId: task.id, taskName });
  }
}

function addObjectPaths(
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

function addFields(
  state: TaskState,
  fields: readonly string[],
  task: FlowTask,
  taskName: string,
): void {
  for (const field of fields) addPath(state, field, task, taskName);
}

function addTodoPaths(
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
function addArrayPaths(
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

function addDecisionPaths(
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

function taskStateEffect(task: FlowTask, incoming: TaskState): TaskState {
  const state = new Map(incoming);
  const taskName = task.name ?? `Task ${task.id}`;
  const config = asRecord(task.toolConfig);

  if (task.type === "tool") {
    switch (task.toolKey) {
      case "find_todos":
        if (task.toolOutputType === "foreach") {
          addTodoPaths(state, "todo", task, taskName);
        } else {
          addArrayPaths(state, "todos", TODO_FIELDS, task, taskName);
        }
        break;

      case "find_todo":
        addTodoPaths(state, "todo", task, taskName);
        break;

      case "create_todo":
      case "update_todo":
      case "mark_todo_done":
      case "archive_todo":
        if (config?.appendState === true) {
          addTodoPaths(state, "todo", task, taskName);
        }
        break;

      case "delete_todo":
        if (config?.appendState === true) {
          addFields(state, ["id", "name"], task, taskName);
        }
        break;

      case "delete_todos_older_than":
        if (config?.appendState === true) {
          addFields(
            state,
            [
              "cutoff",
              "basis",
              "allowNotDone",
              "allowNotArchived",
              "dryRun",
              "matched",
              "deleted",
              "note",
            ],
            task,
            taskName,
          );
        }
        break;

      case "find_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        break;

      case "find_files":
        if (task.toolOutputType === "foreach") {
          addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        } else {
          addArrayPaths(state, "files", FILE_FIELDS, task, taskName);
        }
        break;

      case "find_folder":
        addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        break;

      case "find_folders":
        if (task.toolOutputType === "foreach") {
          addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        } else {
          addArrayPaths(state, "folders", FILE_FIELDS, task, taskName);
        }
        break;

      case "scan_files":
        if (task.toolOutputType === "foreach") {
          addObjectPaths(state, "entry", SCAN_CHANGE_FIELDS, task, taskName);
        } else {
          addArrayPaths(state, "changes", SCAN_CHANGE_FIELDS, task, taskName);
          addObjectPaths(state, "counts", SCAN_COUNT_FIELDS, task, taskName);
        }
        break;

      case "update_file_metadata":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        break;

      case "detect_file_type":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        break;

      case "read_plaintext_file":
      case "read_text_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addPath(state, "content", task, taskName);
        break;

      case "read_image_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(
          state,
          "image",
          ["mimeType", "width", "height", "base64"],
          task,
          taskName,
        );
        addPath(state, "url", task, taskName);
        break;

      case "read_audio_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(
          state,
          "audio",
          ["mimeType", "duration", "url"],
          task,
          taskName,
        );
        addPath(state, "url", task, taskName);
        break;

      case "read_video_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addObjectPaths(
          state,
          "video",
          ["mimeType", "duration", "url"],
          task,
          taskName,
        );
        addPath(state, "url", task, taskName);
        break;

      case "read_other_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        addFields(state, ["url", "base64"], task, taskName);
        break;

      case "create_folder":
        addObjectPaths(state, "folder", FILE_FIELDS, task, taskName);
        break;

      case "create_file":
        addObjectPaths(state, "file", FILE_FIELDS, task, taskName);
        break;

      case "prompt":
        addFields(state, ["text"], task, taskName);
        break;

      case "model_selector":
        if (config?.appendState === true) {
          addFields(state, ["kind", "model"], task, taskName);
        }
        break;

      case "set_state":
      case "append_state":
        if (config?.clearToolState !== false) state.clear();
        break;

      // if / filter_tool_state / display_block never change toolState.
      default:
        break;
    }
  }

  if (task.type === "decision") {
    const appendsDecision = (task.taskResults ?? []).some(
      (result) => result?.appendState === true,
    );
    if (appendsDecision) addDecisionPaths(state, task, taskName);
  }

  if (task.type === "userDecision") {
    for (const option of task.userDecisionOptions ?? []) {
      if (option?.kind !== "dynamic") continue;

      const selector = asRecord(option.selector);
      const selectorPath = asString(selector?.path);
      if (!selectorPath) continue;

      // The selected array item/object is appended directly as a new
      // tool-state entry, so its child paths become the entry's own paths.
      const indexedPrefix = `${selectorPath}.0.`;
      const prefix = `${selectorPath}.`;
      for (const statePath of [...state.keys()]) {
        let relative: string | undefined;

        if (statePath.startsWith(indexedPrefix)) {
          relative = statePath.slice(indexedPrefix.length);
        } else if (statePath.startsWith(prefix)) {
          const rest = statePath.slice(prefix.length);
          // Skip the array index itself; item fields are handled above.
          if (rest === "0" || /^\d+($|\.)/.test(rest)) continue;
          relative = rest;
        }

        if (relative) addPath(state, relative, task, taskName);
      }
    }
  }

  return state;
}

function mergeState(target: TaskState, source: TaskState): void {
  for (const [path, origin] of source) {
    if (!target.has(path)) target.set(path, origin);
  }
}

interface FlowEdges {
  outgoing: Map<number, number[]>;
  incoming: Map<number, number[]>;
}

function buildFlowEdges(tasks: FlowTask[]): FlowEdges {
  const taskIds = new Set(tasks.map((task) => task.id));
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();

  const addEdge = (from: number, to: number | null | undefined) => {
    if (to == null || to === from || !taskIds.has(to)) return;

    const out = outgoing.get(from);
    if (out) out.push(to);
    else outgoing.set(from, [to]);

    const inc = incoming.get(to);
    if (inc) inc.push(from);
    else incoming.set(to, [from]);
  };

  for (const task of tasks) {
    for (const result of task.taskResults ?? []) {
      addEdge(task.id, result?.resultTaskId);
    }

    for (const option of task.userDecisionOptions ?? []) {
      addEdge(task.id, option?.resultTaskId);
    }

    if (task.toolKey === "if") {
      addEdge(task.id, task.onTrueTaskId);
      addEdge(task.id, task.onFalseTaskId);
    }

    // A forced no-match decision never takes its fallback. userDecision has
    // no fallback output at all, and the if tool uses true/false instead.
    const usesFallback =
      task.toolKey !== "if" &&
      task.type !== "userDecision" &&
      !(task.type === "decision" && task.forceUserDecideIfNoMatch);
    if (usesFallback) addEdge(task.id, task.fallbackTaskId);
  }

  return { outgoing, incoming };
}

/**
 * Infers the dot paths that may exist in the selected task's toolState based
 * on the tasks that can run before it. The result is a union across all
 * incoming flow branches.
 */
export function inferToolStatePaths(
  tasks: GetTasksQuery["tasks"] | undefined,
  targetTaskId: number | undefined,
): ToolStatePathSuggestion[] {
  if (targetTaskId == null) return [];

  const flowTasks = (tasks ?? []).flatMap((task) =>
    task?.id != null ? [{ ...task, id: task.id }] : [],
  );
  const byId = new Map(flowTasks.map((task) => [task.id, task]));
  if (!byId.has(targetTaskId)) return [];

  const { outgoing, incoming } = buildFlowEdges(flowTasks);

  // Only consider tasks that can actually reach the selected task.
  const ancestors = new Set<number>([targetTaskId]);
  const stack = [targetTaskId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const parent of incoming.get(current) ?? []) {
      if (ancestors.has(parent)) continue;
      ancestors.add(parent);
      stack.push(parent);
    }
  }

  const indegree = new Map<number, number>();
  for (const id of ancestors) indegree.set(id, 0);
  for (const from of ancestors) {
    for (const to of outgoing.get(from) ?? []) {
      if (!ancestors.has(to)) continue;
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }

  const pending = new Map<number, TaskState>();
  const processed = new Set<number>();
  const queue = [...ancestors]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a - b);

  const processTask = (id: number) => {
    const task = byId.get(id);
    if (!task) return;

    const stateBefore = pending.get(id) ?? new Map();
    const stateAfter = taskStateEffect(task, stateBefore);

    for (const to of outgoing.get(id) ?? []) {
      if (!ancestors.has(to)) continue;

      const target = pending.get(to);
      if (target) mergeState(target, stateAfter);
      else pending.set(to, new Map(stateAfter));

      const next = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, next);
      if (next === 0) queue.push(to);
    }
  };

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (processed.has(id)) continue;
    processed.add(id);
    processTask(id);
  }

  // Cycles are unusual in a flow, but process whatever is left once so the
  // selected task still gets the union of its known predecessors.
  for (const id of [...ancestors].sort((a, b) => a - b)) {
    if (processed.has(id)) continue;
    processed.add(id);
    processTask(id);
  }

  const state = pending.get(targetTaskId) ?? new Map<string, never>();
  return [...state.entries()]
    .map(([path, origin]) => ({
      path,
      sourceTaskId: origin.taskId,
      sourceTaskName: origin.taskName,
    }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

/** Deterministic hue and badge colours for a tool-state path. */
export function toolStatePathColors(path: string): {
  hue: number;
  text: string;
  background: string;
  border: string;
} {
  let hash = 0;
  for (let index = 0; index < path.length; index += 1) {
    hash = (hash * 31 + path.charCodeAt(index)) >>> 0;
  }

  const hue = hash % 360;
  return {
    hue,
    text: `hsl(${hue} 65% 38%)`,
    background: `hsl(${hue} 80% 55% / 16%)`,
    border: `hsl(${hue} 65% 50% / 38%)`,
  };
}

/** Reads the `path` selector out of a selector/config JSON string. */
export function selectorPathFromText(selectorText: string): string | undefined {
  if (!selectorText.trim()) return undefined;

  let selector: unknown;
  try {
    selector = JSON.parse(selectorText);
  } catch {
    return undefined;
  }

  return asString(asRecord(selector)?.path);
}

/**
 * Item-relative paths for a selector. Returns an empty list when the selector
 * has no `path`, because entry-level paths are not valid item paths.
 */
export function relativePathsForSelector(
  suggestions: ToolStatePathSuggestion[],
  selectorText: string,
): ToolStatePathSuggestion[] {
  const path = selectorPathFromText(selectorText);
  if (!path) return [];

  const relative: ToolStatePathSuggestion[] = [];
  const seen = new Set<string>();
  const push = (suggestion: ToolStatePathSuggestion, nextPath: string) => {
    if (!nextPath || seen.has(nextPath)) return;
    seen.add(nextPath);
    relative.push({ ...suggestion, path: nextPath });
  };

  for (const suggestion of suggestions) {
    // Array item fields are inferred as `<path>.0.<field>`; for a selector
    // that points at the array, the useful condition/label paths are the
    // item-relative ones (`id`, `name`, ...).
    const indexedPrefix = `${path}.0.`;
    if (suggestion.path.startsWith(indexedPrefix)) {
      push(suggestion, suggestion.path.slice(indexedPrefix.length));
      continue;
    }

    const prefix = `${path}.`;
    if (!suggestion.path.startsWith(prefix)) continue;

    const rest = suggestion.path.slice(prefix.length);
    // Skip the array index itself and any other unindexed array children.
    if (rest === "0" || /^\d+($|\.)/.test(rest)) continue;
    push(suggestion, rest);
  }

  return relative;
}

/** Extracts item-relative paths for a dynamic source's selector. */
export function pathsForSelectorItem(
  suggestions: ToolStatePathSuggestion[],
  selectorText: string,
): ToolStatePathSuggestion[] {
  const relative = relativePathsForSelector(suggestions, selectorText);
  return relative.length > 0 ? relative : suggestions;
}

/** Merges suggestion lists, keeping the first occurrence of each path. */
export function mergePathSuggestions(
  ...lists: ToolStatePathSuggestion[][]
): ToolStatePathSuggestion[] {
  const merged = new Map<string, ToolStatePathSuggestion>();
  for (const list of lists) {
    for (const suggestion of list) {
      if (!merged.has(suggestion.path)) merged.set(suggestion.path, suggestion);
    }
  }
  return [...merged.values()];
}

/**
 * Suggestions for a config object that may include a `path` selector. Shows
 * both entry-relative paths and item-relative paths for that selector.
 */
export function suggestionsForConfig(
  suggestions: ToolStatePathSuggestion[],
  configText: string,
): ToolStatePathSuggestion[] {
  return mergePathSuggestions(
    suggestions,
    pathsForSelectorItem(suggestions, configText),
  );
}
