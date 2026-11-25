import type { XYPosition } from "@xyflow/react";
import type { FlowTask, TaskFlowNode } from "../taskFlowTypes";

export interface BuildNodesArgs {
  tasks: FlowTask[];
  positions: Map<number, XYPosition>;
  previousPositions: Map<number, XYPosition>;
  pendingPositions: Map<number, XYPosition>;
  selectedTaskId?: number;
  selectedTaskIds?: Set<number>;
  fannedOutTaskIds: Set<number>;
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
  selectedTaskIds,
  fannedOutTaskIds,
  keepPreviousPositions,
  onTaskDelete,
}: BuildNodesArgs): TaskFlowNode[] {
  return tasks.map((task) => ({
    id: String(task.id),
    type: "taskFlow" as const,
    selected: selectedTaskIds
      ? selectedTaskIds.has(task.id)
      : task.id === selectedTaskId,
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
      toolConfig: task.toolConfig ?? null,
      toolOutputType: task.toolOutputType ?? null,
      model: task.model ?? null,
      decisionModel: task.decisionModel ?? null,
      onTrueTaskId: task.onTrueTaskId ?? null,
      onFalseTaskId: task.onFalseTaskId ?? null,
      joinTaskId: task.joinTaskId ?? null,
      fannedOut: fannedOutTaskIds.has(task.id),
      taskResults: (task.taskResults ?? []).filter((result) => result != null),
      forceUserDecideIfNoMatch: task.forceUserDecideIfNoMatch ?? true,
      userDecisionType: task.userDecisionType ?? null,
      userDecisionConfig: task.userDecisionConfig ?? null,
      userDecisionOptions: (task.userDecisionOptions ?? []).filter(
        (option) => option != null,
      ),
      onTaskDelete,
    },
  }));
}
