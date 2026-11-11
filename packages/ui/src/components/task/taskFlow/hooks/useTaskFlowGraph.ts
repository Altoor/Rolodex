import { useEffect, useMemo, useRef } from "react";
import { useNodesState, type XYPosition } from "@xyflow/react";
import type { FlowTask, TaskFlowNode } from "../taskFlowTypes";
import { buildEdges } from "../services/edges";
import { computePositions } from "../services/layout";
import { buildNodes } from "../services/nodes";

interface UseTaskFlowGraphArgs {
  tasks: FlowTask[];
  rootTask: number | undefined;
  effectiveRootId: number | undefined;
  selectedTaskId?: number;
  pendingPositions: { current: Map<number, XYPosition> };
  onTaskDelete: (taskId: number) => void;
}

/** Keeps React Flow nodes/edges in sync with the tasks query. */
export function useTaskFlowGraph({
  tasks,
  rootTask,
  effectiveRootId,
  selectedTaskId,
  pendingPositions,
  onTaskDelete,
}: UseTaskFlowGraphArgs) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskFlowNode>([]);
  const laidOutRoot = useRef<number | "auto" | undefined>(undefined);

  useEffect(() => {
    if (tasks.length === 0) {
      setNodes([]);
      return;
    }

    // Relayout everything only when the first node changes; otherwise keep
    // positions the user dragged to and only assign positions to new tasks.
    const keepPreviousPositions = laidOutRoot.current === (rootTask ?? "auto");
    laidOutRoot.current = rootTask ?? "auto";

    const positions = computePositions(tasks, effectiveRootId);

    setNodes((prev) => {
      const previousPositions = new Map(
        prev.map((node) => [Number(node.id), node.position]),
      );

      return buildNodes({
        tasks,
        positions,
        previousPositions,
        pendingPositions: pendingPositions.current,
        selectedTaskId,
        keepPreviousPositions,
        onTaskDelete,
      });
    });
  }, [
    tasks,
    rootTask,
    effectiveRootId,
    selectedTaskId,
    onTaskDelete,
    pendingPositions,
    setNodes,
  ]);

  // A task placed via "Add task here" only needs its pending position until
  // it has appeared in the node state; after that its current position wins.
  useEffect(() => {
    if (pendingPositions.current.size === 0) return;

    const placed = new Set(nodes.map((node) => Number(node.id)));
    for (const id of pendingPositions.current.keys()) {
      if (placed.has(id)) pendingPositions.current.delete(id);
    }
  }, [nodes, pendingPositions]);

  const edges = useMemo(() => buildEdges(tasks), [tasks]);

  return { nodes, setNodes, onNodesChange, edges };
}
