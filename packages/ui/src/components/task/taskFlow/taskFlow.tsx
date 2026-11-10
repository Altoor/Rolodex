"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import type { ApolloCache } from "@apollo/client/core";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react";
import {
  CREATE_TASK,
  DELETE_TASK,
  UPDATE_TASK,
  UPDATE_TASKRESULT,
} from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { TaskType } from "@repo/queries/__generated__/graphql";
import { Button } from "#components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Spinner } from "#components/ui/spinner";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TaskFlowNodeView from "./taskFlowNode";
import {
  FALLBACK_HANDLE_ID,
  FALSE_HANDLE_ID,
  TRUE_HANDLE_ID,
  type FlowTask,
  type TaskFlowNode,
} from "./taskFlowTypes";

const nodeTypes: NodeTypes = {
  taskFlow: TaskFlowNodeView,
};

const COLUMN_WIDTH = 460;
const ROW_HEIGHT = 200;

/**
 * Computes a layout for every task. When a root task is known, tasks are
 * placed left-to-right following the resultTaskId chain (BFS); tasks that
 * are not reachable from the root fall into a grid below the flow.
 */
const computePositions = (
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

/**
 * Reflects a task link change in the Apollo cache immediately, so the flow
 * updates right away instead of waiting for the refetch to round-trip.
 */
const setTaskFieldInCache = (
  cache: ApolloCache,
  taskId: number,
  field: "fallbackTaskId" | "onTrueTaskId" | "onFalseTaskId",
  value: number | null,
) => {
  const ref = cache.identify({ __typename: "Task", id: taskId });
  if (!ref) return;
  cache.modify({
    id: ref,
    fields: { [field]: () => value },
  });
};

/** Reflects a resultTaskId change on a TaskResult entity immediately. */
const setResultTaskIdInCache = (
  cache: ApolloCache,
  resultId: number,
  resultTaskId: number | null,
) => {
  const ref = cache.identify({ __typename: "TaskResult", id: resultId });
  if (!ref) return;
  cache.modify({
    id: ref,
    fields: { resultTaskId: () => resultTaskId },
  });
};

interface TaskFlowProps {
  selectedTaskId?: number;
  onSelectTaskId?: (id: number | undefined) => void;
  defaultTaskId?: number | null;
  onDefaultTaskChange?: (id: number) => void;
}

/** Menu opened by right-clicking an edge or empty canvas space. */
type FlowContextMenu =
  | { kind: "edge"; x: number; y: number; edge: Edge }
  | { kind: "pane"; x: number; y: number; position: XYPosition };

const TaskFlow = ({
  selectedTaskId,
  onSelectTaskId,
  defaultTaskId,
  onDefaultTaskChange,
}: TaskFlowProps) => {
  const { data, loading } = useQuery(TASKS);
  const [updateTaskResult] = useMutation(UPDATE_TASKRESULT, {
    refetchQueries: [TASKS],
  });
  const [createTask] = useMutation(CREATE_TASK, { refetchQueries: [TASKS] });
  const [deleteTask] = useMutation(DELETE_TASK, { refetchQueries: [TASKS] });
  const [updateTask] = useMutation(UPDATE_TASK, { refetchQueries: [TASKS] });

  const tasks = useMemo<FlowTask[]>(
    () =>
      (data?.tasks ?? [])
        .filter(
          (task): task is NonNullable<typeof task> & { id: number } =>
            task != null && task.id != null,
        )
        .map((task) => ({ ...task, id: task.id })),
    [data],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<TaskFlowNode>([]);
  // Context menu shown when right-clicking an edge or the empty canvas.
  const [contextMenu, setContextMenu] = useState<FlowContextMenu | null>(null);
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

  // Deleting a node deletes the underlying task (and, on the backend, all
  // of that task's TaskResults).
  const handleDeleteTask = useCallback(
    (taskId: number) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Delete this task? This cannot be undone.")
      ) {
        return;
      }

      void deleteTask({ variables: { id: taskId } });
    },
    [deleteTask],
  );

  // Keep react-flow nodes in sync with the tasks query.
  const laidOutRoot = useRef<number | "auto" | undefined>(undefined);
  useEffect(() => {
    if (tasks.length === 0) {
      setNodes([]);
      return;
    }
    // Relayout everything only when the first node changes; otherwise keep
    // positions the user dragged to and only assign positions to new tasks.
    const relayout = laidOutRoot.current !== (rootTask ?? "auto");
    laidOutRoot.current = rootTask ?? "auto";
    const positions = computePositions(tasks, effectiveRootId);
    setNodes((prev) => {
      const prevPositions = new Map(
        prev.map((node) => [Number(node.id), node.position]),
      );
      return tasks.map((task) => ({
        id: String(task.id),
        type: "taskFlow" as const,
        selected: task.id === selectedTaskId,
        position:
          pendingPositions.current.get(task.id) ??
          (!relayout && prevPositions.has(task.id)
            ? prevPositions.get(task.id)!
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
          taskResults: (task.taskResults ?? []).filter(
            (result) => result != null,
          ),
          onTaskDelete: handleDeleteTask,
        },
      }));
    });
  }, [
    tasks,
    rootTask,
    effectiveRootId,
    selectedTaskId,
    handleDeleteTask,
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
  }, [nodes]);

  // Edges are derived from the taskResults' resultTaskId values and each
  // task's fallbackTaskId (rendered dashed).
  const edges = useMemo<Edge[]>(() => {
    const taskIds = new Set(tasks.map((task) => String(task.id)));
    const result: Edge[] = [];
    for (const task of tasks) {
      for (const taskResult of task.taskResults ?? []) {
        if (taskResult?.id == null || taskResult.resultTaskId == null) continue;
        const target = String(taskResult.resultTaskId);
        if (!taskIds.has(target)) continue;
        result.push({
          id: `e-${taskResult.id}`,
          source: String(task.id),
          sourceHandle: String(taskResult.id),
          target,
          targetHandle: "input",
          animated: true,
          markerEnd: MarkerType.ArrowClosed,
        });
      }
      if (
        task.fallbackTaskId != null &&
        task.fallbackTaskId !== task.id &&
        taskIds.has(String(task.fallbackTaskId))
      ) {
        result.push({
          id: `e-fallback-${task.id}`,
          source: String(task.id),
          sourceHandle: FALLBACK_HANDLE_ID,
          target: String(task.fallbackTaskId),
          targetHandle: "input",
          // A lighter grey than the default edge colour (#b1b1b7).
          style: { stroke: "#d4d4d8", strokeDasharray: "5 5" },
          animated: true,
          markerEnd: MarkerType.ArrowClosed,
        });
      }
      if (
        task.toolKey === "if" &&
        task.onTrueTaskId != null &&
        task.onTrueTaskId !== task.id &&
        taskIds.has(String(task.onTrueTaskId))
      ) {
        result.push({
          id: `e-true-${task.id}`,
          source: String(task.id),
          sourceHandle: TRUE_HANDLE_ID,
          target: String(task.onTrueTaskId),
          targetHandle: "input",
          animated: true,
          markerEnd: MarkerType.ArrowClosed,
        });
      }
      if (
        task.toolKey === "if" &&
        task.onFalseTaskId != null &&
        task.onFalseTaskId !== task.id &&
        taskIds.has(String(task.onFalseTaskId))
      ) {
        result.push({
          id: `e-false-${task.id}`,
          source: String(task.id),
          sourceHandle: FALSE_HANDLE_ID,
          target: String(task.onFalseTaskId),
          targetHandle: "input",
          animated: true,
          markerEnd: MarkerType.ArrowClosed,
        });
      }
    }
    return result;
  }, [tasks]);

  // A task can never connect to itself (result or fallback).
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => connection.source !== connection.target,
    [],
  );

  // Connecting an output to another task's input updates the relationship:
  // a TaskResult output updates its resultTaskId, the fallback output
  // updates fallbackTaskId, and if-tool outputs update the branch ids.
  const onConnect = useCallback(
    (connection: Connection) => {
      const targetTaskId = Number(connection.target);
      if (!Number.isFinite(targetTaskId)) return;
      if (
        connection.sourceHandle === FALLBACK_HANDLE_ID ||
        connection.sourceHandle === TRUE_HANDLE_ID ||
        connection.sourceHandle === FALSE_HANDLE_ID
      ) {
        const taskId = Number(connection.source);
        if (!Number.isFinite(taskId)) return;
        const field =
          connection.sourceHandle === FALLBACK_HANDLE_ID
            ? "fallbackTaskId"
            : connection.sourceHandle === TRUE_HANDLE_ID
              ? "onTrueTaskId"
              : "onFalseTaskId";
        void updateTask({
          variables: { id: taskId, [field]: targetTaskId },
          update: (cache) =>
            setTaskFieldInCache(cache, taskId, field, targetTaskId),
        });
        return;
      }
      const resultId = Number(connection.sourceHandle);
      if (!Number.isFinite(resultId)) return;
      void updateTaskResult({
        variables: { id: resultId, resultTaskId: targetTaskId },
        update: (cache) =>
          setResultTaskIdInCache(cache, resultId, targetTaskId),
      });
    },
    [updateTask, updateTaskResult],
  );

  // Deleting an edge clears the matching relationship (resultTaskId,
  // fallbackTaskId, or an if-tool branch id).
  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        if (edge.id.startsWith("e-fallback-")) {
          const taskId = Number(edge.id.replace("e-fallback-", ""));
          if (!Number.isFinite(taskId)) continue;
          void updateTask({
            variables: { id: taskId, fallbackTaskId: null },
            update: (cache) =>
              setTaskFieldInCache(cache, taskId, "fallbackTaskId", null),
          });
          continue;
        }
        if (edge.id.startsWith("e-true-") || edge.id.startsWith("e-false-")) {
          const isTrue = edge.id.startsWith("e-true-");
          const taskId = Number(
            edge.id.replace(isTrue ? "e-true-" : "e-false-", ""),
          );
          if (!Number.isFinite(taskId)) continue;
          const field = isTrue ? "onTrueTaskId" : "onFalseTaskId";
          void updateTask({
            variables: { id: taskId, [field]: null },
            update: (cache) => setTaskFieldInCache(cache, taskId, field, null),
          });
          continue;
        }
        const resultId = Number(edge.id.replace("e-", ""));
        if (!Number.isFinite(resultId)) continue;
        void updateTaskResult({
          variables: { id: resultId, resultTaskId: null },
          update: (cache) => setResultTaskIdInCache(cache, resultId, null),
        });
      }
    },
    [updateTask, updateTaskResult],
  );

  // Keyboard delete (Delete/Backspace on a selected node) also removes the
  // underlying task.
  const onDelete = useCallback(
    ({ nodes }: { nodes: TaskFlowNode[]; edges: Edge[] }) => {
      for (const node of nodes) {
        handleDeleteTask(Number(node.id));
      }
    },
    [handleDeleteTask],
  );

  // Creating a new task directly from the flow; it shows up as a new node.
  const handleCreateTask = useCallback(() => {
    void createTask({
      variables: {
        name: `New Task ${tasks.length + 1}`,
        type: "decision" as TaskType,
      },
    });
  }, [createTask, tasks.length]);

  // Insert a task into an existing edge: source -> new task -> target. The
  // new task chains to the original target through its fallback link, so it
  // works whether the edge came from a result, a fallback, or an if branch.
  const insertTaskOnEdge = useCallback(
    async (edge: Edge) => {
      setContextMenu(null);

      const sourceTaskId = Number(edge.source);
      const targetTaskId = Number(edge.target);
      if (
        !Number.isFinite(sourceTaskId) ||
        !Number.isFinite(targetTaskId)
      ) {
        return;
      }

      const { data } = await createTask({
        variables: {
          name: `New Task ${tasks.length + 1}`,
          type: "decision" as TaskType,
          fallbackTaskId: targetTaskId,
        },
      });
      const newTaskId = data?.createTask?.id;
      if (newTaskId == null) return;

      try {
        if (edge.sourceHandle === FALLBACK_HANDLE_ID) {
          await updateTask({
            variables: { id: sourceTaskId, fallbackTaskId: newTaskId },
          });
        } else if (
          edge.sourceHandle === TRUE_HANDLE_ID ||
          edge.sourceHandle === FALSE_HANDLE_ID
        ) {
          const field =
            edge.sourceHandle === TRUE_HANDLE_ID
              ? "onTrueTaskId"
              : "onFalseTaskId";
          await updateTask({
            variables: { id: sourceTaskId, [field]: newTaskId },
          });
        } else {
          const resultId = Number(edge.sourceHandle);
          if (!Number.isFinite(resultId)) {
            await deleteTask({ variables: { id: newTaskId } });
            return;
          }
          await updateTaskResult({
            variables: { id: resultId, resultTaskId: newTaskId },
          });
        }
      } catch {
        // Avoid leaving an orphaned task if rewiring the source fails.
        await deleteTask({ variables: { id: newTaskId } });
        return;
      }

      onSelectTaskId?.(newTaskId);
    },
    [
      createTask,
      deleteTask,
      onSelectTaskId,
      tasks.length,
      updateTask,
      updateTaskResult,
    ],
  );

  // Create a task at a specific canvas position (right-click empty space).
  const addTaskAtPosition = useCallback(
    async (position: XYPosition) => {
      setContextMenu(null);

      const { data } = await createTask({
        variables: {
          name: `New Task ${tasks.length + 1}`,
          type: "decision" as TaskType,
        },
      });
      const newTaskId = data?.createTask?.id;
      if (newTaskId == null) return;

      pendingPositions.current.set(newTaskId, position);
      onSelectTaskId?.(newTaskId);
    },
    [createTask, onSelectTaskId, tasks.length],
  );

  // Esc closes the context menu.
  useEffect(() => {
    if (!contextMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contextMenu]);

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({ kind: "edge", x: event.clientX, y: event.clientY, edge });
    },
    [],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
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
    [],
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
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">First task</span>
        <Select
          value={effectiveRootId != null ? String(effectiveRootId) : ""}
          onValueChange={(value) => {
            const taskId = Number(value);
            setRootTask(taskId);
            onDefaultTaskChange?.(taskId);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={String(task.id)}>
                  {task.name ?? "Untitled task"}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button onClick={() => handleCreateTask()}>
          New Task <Plus />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
        <ReactFlow
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
          onPaneClick={() => setContextMenu(null)}
          onMoveStart={() => setContextMenu(null)}
          onInit={(instance) => {
            flowInstance.current = instance;
          }}
          isValidConnection={isValidConnection}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
        </ReactFlow>
        {contextMenu ? (
          <>
            <div
              className="fixed inset-0 z-40"
              onPointerDown={() => setContextMenu(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu(null);
              }}
            />
            <div
              role="menu"
              className="fixed z-50 min-w-44 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-accent focus:bg-accent focus:text-accent-foreground"
                onClick={() => {
                  if (contextMenu.kind === "edge") {
                    void insertTaskOnEdge(contextMenu.edge);
                  } else {
                    void addTaskAtPosition(contextMenu.position);
                  }
                }}
              >
                <Plus className="size-4" />
                {contextMenu.kind === "edge"
                  ? "Add task between"
                  : "Add task here"}
              </button>
            </div>
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Click a node to edit it, drag a result output onto another task's input
        to link them, right-click an edge to insert a task in between,
        right-click empty canvas space to add a task there, or create new tasks
        with the "New Task" button.
      </p>
    </div>
  );
};

export default TaskFlow;
