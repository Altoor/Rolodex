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
 * Reflects a fallbackTaskId change in the Apollo cache immediately, so the
 * flow updates right away instead of waiting for the refetch to round-trip.
 */
const setFallbackInCache = (
  cache: ApolloCache,
  taskId: number,
  fallbackTaskId: number | null,
) => {
  const ref = cache.identify({ __typename: "Task", id: taskId });
  if (!ref) return;
  cache.modify({
    id: ref,
    fields: { fallbackTaskId: () => fallbackTaskId },
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
          !relayout && prevPositions.has(task.id)
            ? prevPositions.get(task.id)!
            : positions.get(task.id)!,
        data: {
          taskId: task.id,
          name: task.name ?? "Untitled task",
          type: task.type,
          decisionType: task.decision?.type ?? null,
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
  // updates the task's fallbackTaskId.
  const onConnect = useCallback(
    (connection: Connection) => {
      const targetTaskId = Number(connection.target);
      if (!Number.isFinite(targetTaskId)) return;
      if (connection.sourceHandle === FALLBACK_HANDLE_ID) {
        const taskId = Number(connection.source);
        if (!Number.isFinite(taskId)) return;
        void updateTask({
          variables: { id: taskId, fallbackTaskId: targetTaskId },
          update: (cache) => setFallbackInCache(cache, taskId, targetTaskId),
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

  // Deleting an edge clears the matching relationship (resultTaskId or
  // fallbackTaskId).
  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        if (edge.id.startsWith("e-fallback-")) {
          const taskId = Number(edge.id.replace("e-fallback-", ""));
          if (!Number.isFinite(taskId)) continue;
          void updateTask({
            variables: { id: taskId, fallbackTaskId: null },
            update: (cache) => setFallbackInCache(cache, taskId, null),
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
          isValidConnection={isValidConnection}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted-foreground">
        Click a node to edit it, drag a result output onto another task's input
        to link them, or create new tasks with the "New Task" button.
      </p>
    </div>
  );
};

export default TaskFlow;
