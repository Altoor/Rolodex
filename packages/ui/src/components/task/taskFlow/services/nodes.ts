import type { XYPosition } from "@xyflow/react";
import type { FlowTask, TaskFlowNode } from "../taskFlowTypes";

export interface BuildNodesArgs {
  tasks: FlowTask[];
  positions: Map<number, XYPosition>;
  previousPositions: Map<number, XYPosition>;
  pendingPositions: Map<number, XYPosition>;
  selectedTaskId?: number;
  keepPreviousPositions: boolean;
  onTaskDelete: (taskId: number) => void;
}

/** Maps query tasks and computed positions to React Flow nodes. */
export function buildNodes({
  tasks,
  positions,
  previousPositions,
  pendingPositions,
  selectedTaskId,
  keepPreviousPositions,
  onTaskDelete,
}: BuildNodesArgs): TaskFlowNode[] {
  return tasks.map((task) => ({
    id: String(task.id),
    type: "taskFlow" as const,
    selected: task.id === selectedTaskId,
    position:
      pendingPositions.get(task.id) ??
      (keepPreviousPositions && previousPositions.has(task.id)
        ? previousPositions.get(task.id)!
        : positions.get(task.id)!),
    data: {
      taskId: task.id,
      name: task.name ?? "Untitled task",
      type: task.type,
      decisionType: task.decision?.type ?? null,
      toolKey: task.toolKey ?? null,
      model: task.model ?? null,
      decisionModel: task.decisionModel ?? null,
      onTrueTaskId: task.onTrueTaskId ?? null,
      onFalseTaskId: task.onFalseTaskId ?? null,
      taskResults: (task.taskResults ?? []).filter((result) => result != null),
      onTaskDelete,
    },
  }));
}
