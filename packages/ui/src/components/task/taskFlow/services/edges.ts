import { MarkerType, type Edge } from "@xyflow/react";
import {
  FALLBACK_HANDLE_ID,
  FALSE_HANDLE_ID,
  TRUE_HANDLE_ID,
  type FlowTask,
} from "../taskFlowTypes";

const outputEdge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  style?: Edge["style"],
): Edge => ({
  id,
  source,
  sourceHandle,
  target,
  targetHandle: "input",
  ...(style ? { style } : {}),
  animated: true,
  markerEnd: MarkerType.ArrowClosed,
});

/**
 * Edges are derived from the taskResults' resultTaskId values and each
 * task's fallbackTaskId / if-branch ids.
 */
export function buildEdges(tasks: FlowTask[]): Edge[] {
  const taskIds = new Set(tasks.map((task) => String(task.id)));
  const result: Edge[] = [];

  for (const task of tasks) {
    for (const taskResult of task.taskResults ?? []) {
      if (taskResult?.id == null || taskResult.resultTaskId == null) continue;
      const target = String(taskResult.resultTaskId);
      if (!taskIds.has(target)) continue;
      result.push(
        outputEdge(
          `e-${taskResult.id}`,
          String(task.id),
          String(taskResult.id),
          target,
        ),
      );
    }

    if (
      task.fallbackTaskId != null &&
      task.fallbackTaskId !== task.id &&
      taskIds.has(String(task.fallbackTaskId))
    ) {
      result.push(
        outputEdge(
          `e-fallback-${task.id}`,
          String(task.id),
          FALLBACK_HANDLE_ID,
          String(task.fallbackTaskId),
          {
            // A lighter grey than the default edge colour.
            stroke: "var(--color-edge-muted)",
            strokeDasharray: "5 5",
          },
        ),
      );
    }

    if (
      task.toolKey === "if" &&
      task.onTrueTaskId != null &&
      task.onTrueTaskId !== task.id &&
      taskIds.has(String(task.onTrueTaskId))
    ) {
      result.push(
        outputEdge(
          `e-true-${task.id}`,
          String(task.id),
          TRUE_HANDLE_ID,
          String(task.onTrueTaskId),
        ),
      );
    }

    if (
      task.toolKey === "if" &&
      task.onFalseTaskId != null &&
      task.onFalseTaskId !== task.id &&
      taskIds.has(String(task.onFalseTaskId))
    ) {
      result.push(
        outputEdge(
          `e-false-${task.id}`,
          String(task.id),
          FALSE_HANDLE_ID,
          String(task.onFalseTaskId),
        ),
      );
    }
  }

  return result;
}
