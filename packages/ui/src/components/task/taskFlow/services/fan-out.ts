import type { FlowTask } from "../taskFlowTypes";
import { relatedTaskIds } from "./layout";

/**
 * Tasks that sit inside a foreach fan-out: everything reachable from the
 * per-item entry task until the configured join barrier. The join and the
 * tasks after it stay normal.
 */
export function computeFannedOutTaskIds(tasks: FlowTask[]): Set<number> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const fannedOut = new Set<number>();

  for (const task of tasks) {
    if (
      task.toolOutputType !== "foreach" ||
      task.joinTaskId == null ||
      task.fallbackTaskId == null
    ) {
      continue;
    }

    const joinTaskId = task.joinTaskId;
    const queue = [task.fallbackTaskId];
    const visited = new Set<number>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (current == null || current === joinTaskId || visited.has(current)) {
        continue;
      }
      if (!byId.has(current)) continue;

      visited.add(current);
      fannedOut.add(current);

      for (const next of relatedTaskIds(byId.get(current))) {
        if (next !== joinTaskId && !visited.has(next)) queue.push(next);
      }
    }
  }

  return fannedOut;
}
