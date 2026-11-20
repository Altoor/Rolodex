import { useCallback, useEffect, useState } from "react";
import type { Edge, ReactFlowInstance } from "@xyflow/react";
import type { FlowContextMenu, TaskFlowNode } from "../taskFlowTypes";

/** Owns the edge/pane context menu and its open/close handlers. */
export function useTaskFlowContextMenu(
  flowInstance: React.RefObject<ReactFlowInstance<TaskFlowNode, Edge> | null>,
) {
  const [contextMenu, setContextMenu] = useState<FlowContextMenu | null>(null);

  // Esc closes the context menu.
  useEffect(() => {
    if (!contextMenu) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contextMenu]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, taskIds: number[]) => {
      event.preventDefault();
      setContextMenu({
        kind: "nodes",
        x: event.clientX,
        y: event.clientY,
        taskIds,
      });
    },
    [],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        kind: "edge",
        x: event.clientX,
        y: event.clientY,
        edge,
      });
    },
    [],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      // Right-clicking a node opens the node menu instead.
      if (
        event.target instanceof Element &&
        event.target.closest(".react-flow__node")
      ) {
        return;
      }

      event.preventDefault();
      const position = flowInstance.current
        ? flowInstance.current.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          })
        : { x: event.clientX, y: event.clientY };

      setContextMenu({
        kind: "pane",
        x: event.clientX,
        y: event.clientY,
        position,
      });
    },
    [flowInstance],
  );

  return {
    contextMenu,
    closeContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
  };
}
