import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";
import {
  asRecord,
  asString,
  mergeState,
  taskStateEffect,
  type FlowTask,
  type TaskState,
  type ToolStatePathSuggestion,
} from "./toolStateDerivation";

export type { FlowTask, ToolStatePathSuggestion } from "./toolStateDerivation";
export { promptFieldNamesFromText } from "./toolStateDerivation";
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
