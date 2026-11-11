import type { XYPosition } from "@xyflow/react";
import type { FlowTask } from "../taskFlowTypes";

export const COLUMN_WIDTH = 460;
export const ROW_HEIGHT = 200;

/**
 * Computes a layout for every task. When a root task is known, tasks are
 * placed left-to-right following the resultTaskId chain (BFS); tasks that
 * are not reachable from the root fall into a grid below the flow.
 */
export const computePositions = (
  tasks: FlowTask[],
  rootId: number | undefined,
): Map<number, XYPosition> => {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const positions = new Map<number, XYPosition>();

  if (rootId != null && byId.has(rootId)) {
    const depth = new Map<number, number>([[rootId, 0]]);
    const visited: number[] = [rootId];
    const queue: number[] = [rootId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current == null) continue;
      const task = byId.get(current);
      // Follow both result links and the fallback link.
      const relatedIds = [
        ...(task?.taskResults ?? [])
          .map((result) => result?.resultTaskId)
          .filter((id): id is number => id != null),
        ...(task?.fallbackTaskId != null ? [task.fallbackTaskId] : []),
        ...(task?.onTrueTaskId != null ? [task.onTrueTaskId] : []),
        ...(task?.onFalseTaskId != null ? [task.onFalseTaskId] : []),
      ];
      for (const targetId of relatedIds) {
        if (!byId.has(targetId) || depth.has(targetId)) {
          continue;
        }
        depth.set(targetId, (depth.get(current) ?? 0) + 1);
        visited.push(targetId);
        queue.push(targetId);
      }
    }

    visited.forEach((id, index) => {
      positions.set(id, {
        x: 40 + (depth.get(id) ?? 0) * COLUMN_WIDTH,
        y: 40 + index * ROW_HEIGHT,
      });
    });

    // Tasks not reachable from the root go into a grid below the flow.
    let index = 0;
    for (const task of tasks) {
      if (positions.has(task.id)) continue;
      positions.set(task.id, {
        x: 40 + (index % 3) * COLUMN_WIDTH,
        y:
          40 +
          (visited.length + 1) * ROW_HEIGHT +
          Math.floor(index / 3) * ROW_HEIGHT,
      });
      index++;
    }
  } else {
    tasks.forEach((task, index) => {
      positions.set(task.id, {
        x: 40 + (index % 3) * COLUMN_WIDTH,
        y: 40 + Math.floor(index / 3) * ROW_HEIGHT,
      });
    });
  }

  return positions;
};
