"use client";

import { useMutation, useQuery } from "@apollo/client/react";
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
import "@xyflow/react/dist/style.css";
import {
  CREATE_TASK,
  DELETE_TASK,
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
import { type FlowTask, type TaskFlowNode } from "./taskFlowTypes";

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
      for (const result of task?.taskResults ?? []) {
        const targetId = result?.resultTaskId;
        if (targetId == null || !byId.has(targetId) || depth.has(targetId)) {
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

interface TaskFlowProps {
  selectedTaskId?: number;
  onSelectTaskId?: (id: number | undefined) => void;
}

const TaskFlow = ({ selectedTaskId, onSelectTaskId }: TaskFlowProps) => {
  const { data, loading } = useQuery(TASKS);
  const [updateTaskResult, { client }] = useMutation(UPDATE_TASKRESULT);
  const [createTask] = useMutation(CREATE_TASK);
  const [deleteTask] = useMutation(DELETE_TASK);

  const tasks = useMemo<FlowTask[]>(
    () =>
      (data?.tasks ?? [])
        .filter((task): task is NonNullable<typeof task> & { id: number } =>
          task != null && task.id != null,
        )
        .map((task) => ({ ...task, id: task.id })),
    [data],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<TaskFlowNode>([]);
  // The task chosen as the first (entry) node of the flow via the dropdown.
  // Defaults to the first task until the user picks one.
  const [rootTask, setRootTask] = useState<number | undefined>(undefined);
  const effectiveRootId = rootTask ?? tasks[0]?.id;

  // Deleting a node deletes the underlying task (and, on the backend, all
  // of that task's TaskResults).
  const handleDeleteTask = useCallback(
    (taskId: number) => {
      void deleteTask({ variables: { id: taskId } }).then(({ error }) => {
        if (!error) {
          client.refetchQueries({ include: [TASKS] });
        }
      });
    },
    [deleteTask, client],
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
  }, [tasks, rootTask, effectiveRootId, selectedTaskId, handleDeleteTask, setNodes]);

  // Edges are derived from the taskResults' resultTaskId values.
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
    }
    return result;
  }, [tasks]);

  // Connecting an output (a TaskResult) to another task's input updates the
  // TaskResult's resultTaskId to point at the newly connected task.
  const onConnect = useCallback(
    (connection: Connection) => {
      const resultId = Number(connection.sourceHandle);
      const resultTaskId = Number(connection.target);
      if (!Number.isFinite(resultId) || !Number.isFinite(resultTaskId)) return;
      void updateTaskResult({
        variables: { id: resultId, resultTaskId },
      }).then(({ error }) => {
        if (!error) {
          client.refetchQueries({ include: [TASKS] });
        }
      });
    },
    [updateTaskResult, client],
  );

  // Deleting an edge clears the TaskResult's resultTaskId.
  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        const resultId = Number(edge.id.replace("e-", ""));
        if (!Number.isFinite(resultId)) continue;
        void updateTaskResult({
          variables: { id: resultId, resultTaskId: null },
        }).then(({ error }) => {
          if (!error) {
            client.refetchQueries({ include: [TASKS] });
          }
        });
      }
    },
    [updateTaskResult, client],
  );

  // Keyboard delete (Delete/Backspace on a selected node) also removes the
  // underlying task.
  const onDelete = useCallback(
    ({ nodes }: { nodes: TaskFlowNode[] }) => {
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
    }).then(({ error }) => {
      if (!error) {
        client.refetchQueries({ include: [TASKS] });
      }
    });
  }, [createTask, client, tasks.length]);

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
          onValueChange={(value) => setRootTask(Number(value))}
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
          fitView
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted-foreground">
        Click a node to edit it, drag a result output onto another task's
        input to link them, or create new tasks with the "New Task" button.
      </p>
    </div>
  );
};

export default TaskFlow;
