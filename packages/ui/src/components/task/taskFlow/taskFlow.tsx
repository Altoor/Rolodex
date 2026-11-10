"use client";

import { useQuery } from "@apollo/client/react";
import type { Edge, NodeTypes, ReactFlowInstance, XYPosition } from "@xyflow/react";
import { TASKS } from "@repo/queries/tasks/task-queries";
import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";
import { Spinner } from "#components/ui/spinner";
import { useCallback, useMemo, useRef, useState } from "react";
import TaskFlowNodeView from "./taskFlowNode";
import type { FlowTask, TaskFlowNode, TaskFlowProps } from "./taskFlowTypes";
import TaskFlowCanvas from "./components/taskFlowCanvas";
import TaskFlowHelpText from "./components/taskFlowHelpText";
import TaskFlowToolbar from "./components/taskFlowToolbar";
import { useTaskFlowActions } from "./hooks/useTaskFlowActions";
import { useTaskFlowContextMenu } from "./hooks/useTaskFlowContextMenu";
import { useTaskFlowGraph } from "./hooks/useTaskFlowGraph";

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
        .filter(
          (task): task is IdTask => task != null && task.id != null,
        )
        .map((task) => ({ ...task, id: task.id })),
    [data],
  );

  // Positions chosen by "Add task here" for tasks that do not exist in the
  // nodes state yet. Cleared once the new node has been laid out.
  const pendingPositions = useRef<Map<number, XYPosition>>(new Map());
  const flowInstance = useRef<ReactFlowInstance<TaskFlowNode, Edge> | null>(
    null,
  );

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
    handleCreateTask,
    insertTaskOnEdge,
    addTaskAtPosition,
    onConnect,
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
    onEdgeContextMenu,
    onPaneContextMenu,
  } = useTaskFlowContextMenu(flowInstance);

  const { nodes, onNodesChange, edges } = useTaskFlowGraph({
    tasks,
    rootTask,
    effectiveRootId,
    selectedTaskId,
    pendingPositions,
    onTaskDelete: handleDeleteTask,
  });

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

  const handleAddAtPosition = useCallback(
    (position: XYPosition) => {
      closeContextMenu();
      void addTaskAtPosition(position);
    },
    [addTaskAtPosition, closeContextMenu],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: TaskFlowNode) => {
      onSelectTaskId?.(Number(node.id));
    },
    [onSelectTaskId],
  );

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
        onEdgesDelete={onEdgesDelete}
        onDelete={onDelete}
        onNodeClick={onNodeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onInit={(instance) => {
          flowInstance.current = instance;
        }}
        contextMenu={contextMenu}
        onCloseContextMenu={closeContextMenu}
        onInsertOnEdge={handleInsertOnEdge}
        onAddAtPosition={handleAddAtPosition}
      />
      <TaskFlowHelpText />
    </div>
  );
};

export default TaskFlow;
