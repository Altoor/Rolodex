"use client";

import { useQuery } from "@apollo/client/react";
import type {
  Edge,
  NodeTypes,
  ReactFlowInstance,
  XYPosition,
} from "@xyflow/react";
import { TASKS } from "@repo/queries/tasks/task-queries";
import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";
import { Spinner } from "#components/ui/spinner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TaskFlowNodeView from "./taskFlowNode";
import type { FlowTask, TaskFlowNode, TaskFlowProps } from "./taskFlowTypes";
import TaskFlowCanvas from "./components/taskFlowCanvas";
import TaskFlowHelpText from "./components/taskFlowHelpText";
import TaskFlowToolbar from "./components/taskFlowToolbar";
import { useTaskFlowActions } from "./hooks/useTaskFlowActions";
import { useTaskFlowContextMenu } from "./hooks/useTaskFlowContextMenu";
import { useTaskFlowGraph } from "./hooks/useTaskFlowGraph";
import { useTaskTransfer } from "./hooks/useTaskTransfer";

const nodeTypes: NodeTypes = {
  taskFlow: TaskFlowNodeView,
};

type QueryTask = NonNullable<GetTasksQuery["tasks"]>[number];
type IdTask = QueryTask & { id: number };

const TaskFlow = ({
  selectedTaskId,
  onSelectTaskId,
  defaultTaskId,
  onDefaultTaskChange,
}: TaskFlowProps) => {
  const { data, loading } = useQuery(TASKS);

  const tasks = useMemo<FlowTask[]>(
    () =>
      (data?.tasks ?? [])
        .filter((task): task is IdTask => task != null && task.id != null)
        .map((task) => ({ ...task, id: task.id })),
    [data],
  );

  // Positions chosen by "Add task here" for tasks that do not exist in the
  // nodes state yet. Cleared once the new node has been laid out.
  const pendingPositions = useRef<Map<number, XYPosition>>(new Map());
  const flowInstance = useRef<ReactFlowInstance<TaskFlowNode, Edge> | null>(
    null,
  );
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // The task chosen as the first (entry) node of the flow via the dropdown.
  // Prefer the user's saved default task, then their in-session choice, then
  // the first task returned by the API.
  const [rootTask, setRootTask] = useState<number | undefined>(undefined);
  const validDefaultTaskId =
    defaultTaskId != null && tasks.some((task) => task.id === defaultTaskId)
      ? defaultTaskId
      : undefined;
  const effectiveRootId = rootTask ?? validDefaultTaskId ?? tasks[0]?.id;

  const {
    handleDeleteTask,
    handleDeleteTasks,
    handleCreateTask,
    insertTaskOnEdge,
    addTaskAtPosition,
    onConnect,
    onReconnect,
    onEdgesDelete,
    onDelete,
  } = useTaskFlowActions({
    tasks,
    pendingPositions,
    onSelectTaskId,
  });

  const {
    contextMenu,
    closeContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
  } = useTaskFlowContextMenu(flowInstance);

  const { nodes, onNodesChange, edges, setNodes } = useTaskFlowGraph({
    tasks,
    rootTask,
    effectiveRootId,
    selectedTaskId,
    pendingPositions,
    onTaskDelete: handleDeleteTask,
  });

  // Place pasted tasks at the click position, or at the canvas center for
  // keyboard paste. Nodes that already arrived are moved immediately; nodes
  // still loading pick the position up when they are built.
  const handlePastedTasks = useCallback(
    (taskIds: number[], position?: XYPosition) => {
      let base = position;
      if (!base) {
        const rect = canvasRef.current?.getBoundingClientRect();
        const instance = flowInstance.current;
        base =
          rect && instance
            ? instance.screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              })
            : { x: 0, y: 0 };
      }

      taskIds.forEach((taskId, index) => {
        pendingPositions.current.set(taskId, {
          x: base.x + (index % 3) * 300,
          y: base.y + Math.floor(index / 3) * 180,
        });
      });

      setNodes((prev) => {
        let changed = false;
        const next = prev.map((node) => {
          const pending = pendingPositions.current.get(Number(node.id));
          if (!pending) return node;
          changed = true;
          return { ...node, position: pending };
        });
        return changed ? next : prev;
      });

      onSelectTaskId?.(taskIds[0]);
    },
    [onSelectTaskId, setNodes],
  );

  const {
    copyTasks,
    exportTaskFile,
    pasteTasks,
    exporting,
    importing,
    notice,
    error,
  } = useTaskTransfer({ onTasksImported: handlePastedTasks });

  const handleRootChange = useCallback(
    (taskId: number) => {
      setRootTask(taskId);
      onDefaultTaskChange?.(taskId);
    },
    [onDefaultTaskChange],
  );

  const handleInsertOnEdge = useCallback(
    (edge: Edge) => {
      closeContextMenu();
      void insertTaskOnEdge(edge);
    },
    [closeContextMenu, insertTaskOnEdge],
  );

  const handleDeleteEdge = useCallback(
    (edge: Edge) => {
      closeContextMenu();
      onEdgesDelete([edge]);
    },
    [closeContextMenu, onEdgesDelete],
  );

  const handleAddAtPosition = useCallback(
    (position: XYPosition) => {
      closeContextMenu();
      void addTaskAtPosition(position);
    },
    [addTaskAtPosition, closeContextMenu],
  );

  const handleCopyTasks = useCallback(
    (taskIds: number[]) => {
      closeContextMenu();
      void copyTasks(taskIds);
    },
    [closeContextMenu, copyTasks],
  );

  const handleExportTasks = useCallback(
    (taskIds: number[]) => {
      closeContextMenu();
      void exportTaskFile(taskIds);
    },
    [closeContextMenu, exportTaskFile],
  );

  const handleDeleteTasksFromMenu = useCallback(
    (taskIds: number[]) => {
      closeContextMenu();
      handleDeleteTasks(taskIds);
    },
    [closeContextMenu, handleDeleteTasks],
  );

  const handlePasteAtPosition = useCallback(
    (position: XYPosition) => {
      closeContextMenu();
      void pasteTasks(position);
    },
    [closeContextMenu, pasteTasks],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: TaskFlowNode) => {
      // Modifier-clicks build a multi-selection; leave the builder selection
      // alone so rebuilding nodes does not collapse it.
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      onSelectTaskId?.(Number(node.id));
    },
    [onSelectTaskId],
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: TaskFlowNode) => {
      const nodeId = Number(node.id);
      const selectedNodes = nodes.filter((candidate) => candidate.selected);
      const isSelected = selectedNodes.some(
        (candidate) => Number(candidate.id) === nodeId,
      );
      const taskIds = isSelected
        ? selectedNodes.map((candidate) => Number(candidate.id))
        : [nodeId];

      // Right-clicking outside the selection targets just that task.
      if (!isSelected) {
        setNodes((prev) =>
          prev.map((candidate) => ({
            ...candidate,
            selected: Number(candidate.id) === nodeId,
          })),
        );
        onSelectTaskId?.(nodeId);
      }

      onNodeContextMenu(event, taskIds);
    },
    [nodes, onNodeContextMenu, onSelectTaskId, setNodes],
  );

  const pasteAtCanvasCenter = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const instance = flowInstance.current;

    if (!rect || !instance) {
      void pasteTasks();
      return;
    }

    void pasteTasks(
      instance.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }),
    );
  }, [pasteTasks]);

  // Ctrl/Cmd+C and Ctrl/Cmd+V for the current canvas selection. Delete and
  // Backspace are handled by React Flow's deleteKeyCode.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        if (target.closest("input, textarea, select")) return;
      }

      const key = event.key.toLowerCase();

      if (key === "c") {
        const taskIds = nodes
          .filter((node) => node.selected)
          .map((node) => Number(node.id));
        if (taskIds.length === 0) return;

        event.preventDefault();
        void copyTasks(taskIds);
        return;
      }

      if (key === "v") {
        event.preventDefault();
        pasteAtCanvasCenter();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copyTasks, nodes, pasteAtCanvasCenter]);

  if (loading) {
    return <Spinner />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <TaskFlowToolbar
        tasks={tasks}
        effectiveRootId={effectiveRootId}
        onRootChange={handleRootChange}
        onCreateTask={handleCreateTask}
      />
      <TaskFlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onEdgesDelete={onEdgesDelete}
        onDelete={onDelete}
        onNodeClick={onNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onInit={(instance) => {
          flowInstance.current = instance;
        }}
        containerRef={canvasRef}
        contextMenu={contextMenu}
        onCloseContextMenu={closeContextMenu}
        onInsertOnEdge={handleInsertOnEdge}
        onDeleteEdge={handleDeleteEdge}
        onAddAtPosition={handleAddAtPosition}
        onCopyTasks={handleCopyTasks}
        onExportTasks={handleExportTasks}
        onDeleteTasks={handleDeleteTasksFromMenu}
        onPasteTasks={handlePasteAtPosition}
      />
      {exporting ? (
        <p className="text-xs text-muted-foreground">Preparing tasks…</p>
      ) : importing ? (
        <p className="text-xs text-muted-foreground">Pasting tasks…</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : notice ? (
        <p className="text-xs text-muted-foreground">{notice}</p>
      ) : null}
      <TaskFlowHelpText />
    </div>
  );
};

export default TaskFlow;
