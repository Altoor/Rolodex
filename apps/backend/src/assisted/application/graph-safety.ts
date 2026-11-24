import { db } from "@repo/db";
import { MAX_CHAIN_DEPTH } from "../../queue/constants";

export class RevisionGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionGraphError";
  }
}

interface GraphNode {
  id: number;
  children: number[];
}

async function loadNode(
  id: number,
  cache: Map<number, GraphNode | null>,
): Promise<GraphNode | null> {
  if (cache.has(id)) return cache.get(id) ?? null;

  const row = await db.query.tasks.findFirst({ where: { id } });
  if (!row) {
    cache.set(id, null);
    return null;
  }

  const node: GraphNode = {
    id,
    children: [row.fallbackTaskId, row.onTrueTaskId, row.onFalseTaskId].filter(
      (value): value is number => typeof value === "number",
    ),
  };
  cache.set(id, node);
  return node;
}

export interface GraphSafetyResult {
  /** Longest number of edges below the inspected roots. */
  depth: number;
}

/**
 * Walks fallback/onTrue/onFalse edges from the supplied roots.
 *
 * `forbidden` is the current task for revisions that replace or run after it:
 * reaching it again means the new edge closes a cycle. Missing targets are
 * rejected too, so a revision cannot save a graph that dead-ends at a deleted
 * task.
 */
export async function inspectGraph(
  roots: number[],
  forbidden: Set<number>,
  maxDepth = MAX_CHAIN_DEPTH,
): Promise<GraphSafetyResult> {
  const cache = new Map<number, GraphNode | null>();
  const visiting = new Set<number>();
  const memo = new Map<number, number>();
  let deepest = 0;

  async function visit(id: number, depth: number): Promise<number> {
    if (forbidden.has(id)) {
      throw new RevisionGraphError(
        "That change would point back to the current task and create a loop.",
      );
    }
    if (depth > maxDepth) {
      throw new RevisionGraphError(
        `That change would exceed the maximum chain depth of ${maxDepth}.`,
      );
    }

    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) {
      throw new RevisionGraphError(
        "That change would create a loop in the task flow.",
      );
    }

    const node = await loadNode(id, cache);
    if (!node) {
      throw new RevisionGraphError(
        `That change points at task ${id}, which does not exist.`,
      );
    }

    visiting.add(id);
    let longest = 0;
    for (const child of node.children) {
      longest = Math.max(longest, 1 + (await visit(child, depth + 1)));
    }
    visiting.delete(id);
    memo.set(id, longest);
    deepest = Math.max(deepest, depth + longest);
    return longest;
  }

  for (const root of roots) {
    await visit(root, 0);
  }

  return { depth: deepest };
}

/**
 * Checks the shape of a revision before any draft tasks are written.
 *
 * Insertions add steps at the current queue depth, so the resulting chain must
 * still fit inside `MAX_CHAIN_DEPTH`. Edges leaving an after/replacement task
 * may not point back at the current task.
 */
export async function assertRevisionFits(input: {
  stepDepth: number;
  insertionCount: number;
  currentTaskId: number;
  currentNextId: number | null;
  /** Targets of drafts that will run after the current task. */
  afterRoots?: number[];
  /** Targets of the replacement task (which reuses the current task id). */
  replacementRoots?: number[];
  replacement?: boolean;
}): Promise<void> {
  const afterRoots = input.afterRoots ?? [];
  const replacementRoots = input.replacementRoots ?? [];

  for (const root of [...afterRoots, ...replacementRoots]) {
    if (root === input.currentTaskId) {
      throw new RevisionGraphError(
        "That change would point back to the current task and create a loop.",
      );
    }
  }

  if (input.currentNextId != null) {
    const { depth } = await inspectGraph(
      [input.currentNextId],
      input.replacement ? new Set([input.currentTaskId]) : new Set(),
      Math.max(0, MAX_CHAIN_DEPTH - input.stepDepth),
    );
    if (
      input.stepDepth + input.insertionCount + 1 + depth >
      MAX_CHAIN_DEPTH
    ) {
      throw new RevisionGraphError(
        `That change would exceed the maximum chain depth of ${MAX_CHAIN_DEPTH}.`,
      );
    }
  }

  if (afterRoots.length > 0 || replacementRoots.length > 0) {
    await inspectGraph(
      input.replacement ? replacementRoots : afterRoots,
      new Set([input.currentTaskId]),
      Math.max(0, MAX_CHAIN_DEPTH - input.stepDepth),
    );
  }

  if (input.stepDepth + input.insertionCount + 1 > MAX_CHAIN_DEPTH) {
    throw new RevisionGraphError(
      `That change would exceed the maximum chain depth of ${MAX_CHAIN_DEPTH}.`,
    );
  }
}
