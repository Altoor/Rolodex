import type { XYPosition } from "@xyflow/react";
import type { FlowTask } from "../taskFlowTypes";
import { switchTargetTaskIds } from "./switch-config";

export const COLUMN_WIDTH = 460;
export const ROW_HEIGHT = 200;

function relatedTaskIds(task: FlowTask | undefined): number[] {
  if (!task) return [];

  return [
    ...(task.taskResults ?? [])
      .map((result) => result?.resultTaskId)
      .filter((id): id is number => id != null),
    ...(task.userDecisionOptions ?? [])
      .map((option) => option?.resultTaskId)
      .filter((id): id is number => id != null),
    ...(task.fallbackTaskId != null &&
    task.toolKey !== "if" &&
    task.toolKey !== "switch" &&
    task.type !== "userDecision" &&
    !(task.type === "decision" && task.forceUserDecideIfNoMatch)
      ? [task.fallbackTaskId]
      : []),
    ...(task.onTrueTaskId != null ? [task.onTrueTaskId] : []),
    ...(task.onFalseTaskId != null ? [task.onFalseTaskId] : []),
    ...(task.toolKey === "switch" ? switchTargetTaskIds(task) : []),
  ];
}

/**
 * Computes a left-to-right layout for every task. Columns come from BFS depth;
 * within a column, a single child stays on its parent's row, so chains run
 * straight to the right. Multiple children fan out around the parent and are
 * pushed down only to avoid overlaps.
 *
 * Tasks not reachable from the root fall into a grid below the flow.
 */
export const computePositions = (
  tasks: FlowTask[],
  rootId: number | undefined,
): Map<number, XYPosition> => {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const positions = new Map<number, XYPosition>();

  if (rootId == null || !byId.has(rootId)) {
    tasks.forEach((task, index) => {
      positions.set(task.id, {
        x: 40 + (index % 3) * COLUMN_WIDTH,
        y: 40 + Math.floor(index / 3) * ROW_HEIGHT,
      });
    });
    return positions;
  }

  const depth = new Map<number, number>([[rootId, 0]]);
  const parent = new Map<number, number>();
  const order: number[] = [rootId];
  const queue: number[] = [rootId];
  const columns: number[][] = [[rootId]];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null) continue;

    for (const targetId of relatedTaskIds(byId.get(current))) {
      if (!byId.has(targetId) || depth.has(targetId)) continue;

      const nextDepth = (depth.get(current) ?? 0) + 1;
      depth.set(targetId, nextDepth);
      parent.set(targetId, current);
      order.push(targetId);
      queue.push(targetId);
      (columns[nextDepth] ??= []).push(targetId);
    }
  }

  const orderIndex = new Map(order.map((id, index) => [id, index]));

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex];
    if (!column || column.length === 0) continue;

    const desired = column.map((id) => {
      const parentId = parent.get(id);
      const parentPosition = parentId != null ? positions.get(parentId) : null;

      if (parentPosition == null) {
        return { id, y: 40 };
      }

      const siblings = column.filter(
        (candidate) => parent.get(candidate) === parentId,
      );
      const siblingIndex = siblings.indexOf(id);

      // A single child keeps its parent's row, so a linear chain stays flat.
      if (siblings.length <= 1) {
        return { id, y: parentPosition.y };
      }

      return {
        id,
        y:
          parentPosition.y +
          (siblingIndex - (siblings.length - 1) / 2) * ROW_HEIGHT,
      };
    });

    desired.sort(
      (a, b) =>
        a.y - b.y || (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
    );

    let cursor = Number.NEGATIVE_INFINITY;
    for (const entry of desired) {
      const y = Math.max(entry.y, cursor);
      positions.set(entry.id, {
        x: 40 + columnIndex * COLUMN_WIDTH,
        y,
      });
      cursor = y + ROW_HEIGHT;
    }
  }

  // Keep the whole flow inside visible coordinates without changing relative
  // placement.
  const visibleY = [...positions.values()].map((position) => position.y);
  const minY = visibleY.length > 0 ? Math.min(...visibleY) : 40;
  const shiftY = minY < 40 ? 40 - minY : 0;
  if (shiftY > 0) {
    for (const [id, position] of positions) {
      positions.set(id, { ...position, y: position.y + shiftY });
    }
  }

  // Tasks not reachable from the root go into a grid below the flow.
  const maxY =
    positions.size > 0
      ? Math.max(...[...positions.values()].map((position) => position.y))
      : 40;
  let index = 0;
  for (const task of tasks) {
    if (positions.has(task.id)) continue;
    positions.set(task.id, {
      x: 40 + (index % 3) * COLUMN_WIDTH,
      y: maxY + ROW_HEIGHT * 2 + Math.floor(index / 3) * ROW_HEIGHT,
    });
    index++;
  }

  return positions;
};
