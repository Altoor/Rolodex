import { useCallback } from "react";
import { useMutation } from "@apollo/client/react";
import type { Connection, Edge, XYPosition } from "@xyflow/react";
import {
  CREATE_TASK,
  DELETE_TASK,
  UPDATE_TASK,
  UPDATE_TASKRESULT,
} from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { TaskType } from "@repo/queries/__generated__/graphql";
import type { FlowTask, TaskFlowNode } from "../taskFlowTypes";
import { setResultTaskIdInCache, setTaskFieldInCache } from "../services/cache";
import { parseEdgeId, parseSourceHandle } from "../services/connection";

interface UseTaskFlowActionsArgs {
  tasks: FlowTask[];
  pendingPositions: { current: Map<number, XYPosition> };
  onSelectTaskId?: (id: number | undefined) => void;
}

/** Owns the flow's mutations and the callbacks that map gestures to them. */
export function useTaskFlowActions({
  tasks,
  pendingPositions,
  onSelectTaskId,
}: UseTaskFlowActionsArgs) {
  const [createTask] = useMutation(CREATE_TASK, { refetchQueries: [TASKS] });
  const [deleteTask] = useMutation(DELETE_TASK, { refetchQueries: [TASKS] });
  const [updateTask] = useMutation(UPDATE_TASK, { refetchQueries: [TASKS] });
  const [updateTaskResult] = useMutation(UPDATE_TASKRESULT, {
    refetchQueries: [TASKS],
  });

  // Deleting a node deletes the underlying task (and, on the backend, all of
  // that task's TaskResults).
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

  // Connecting an output to another task's input updates the relationship.
  const onConnect = useCallback(
    (connection: Connection) => {
      const targetTaskId = Number(connection.target);
      if (!Number.isFinite(targetTaskId)) return;

      const sourceHandle = parseSourceHandle(connection.sourceHandle);
      if (!sourceHandle) return;

      if (sourceHandle.kind === "taskField") {
        const taskId = Number(connection.source);
        if (!Number.isFinite(taskId)) return;

        void updateTask({
          variables: { id: taskId, [sourceHandle.field]: targetTaskId },
          update: (cache) =>
            setTaskFieldInCache(
              cache,
              taskId,
              sourceHandle.field,
              targetTaskId,
            ),
        });
        return;
      }

      void updateTaskResult({
        variables: {
          id: sourceHandle.resultId,
          resultTaskId: targetTaskId,
        },
        update: (cache) =>
          setResultTaskIdInCache(cache, sourceHandle.resultId, targetTaskId),
      });
    },
    [updateTask, updateTaskResult],
  );

  // Deleting an edge clears the matching relationship.
  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        const parsed = parseEdgeId(edge.id);
        if (!parsed) continue;

        if (parsed.kind === "taskField") {
          void updateTask({
            variables: { id: parsed.taskId, [parsed.field]: null },
            update: (cache) =>
              setTaskFieldInCache(cache, parsed.taskId, parsed.field, null),
          });
          continue;
        }

        void updateTaskResult({
          variables: { id: parsed.resultId, resultTaskId: null },
          update: (cache) =>
            setResultTaskIdInCache(cache, parsed.resultId, null),
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
  // new task chains to the original target through its fallback link.
  const insertTaskOnEdge = useCallback(
    async (edge: Edge) => {
      const sourceTaskId = Number(edge.source);
      const targetTaskId = Number(edge.target);
      if (!Number.isFinite(sourceTaskId) || !Number.isFinite(targetTaskId)) {
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
        const sourceHandle = parseSourceHandle(edge.sourceHandle);
        if (!sourceHandle) {
          await deleteTask({ variables: { id: newTaskId } });
          return;
        }

        if (sourceHandle.kind === "taskField") {
          await updateTask({
            variables: { id: sourceTaskId, [sourceHandle.field]: newTaskId },
          });
        } else {
          await updateTaskResult({
            variables: { id: sourceHandle.resultId, resultTaskId: newTaskId },
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
    [createTask, onSelectTaskId, pendingPositions, tasks.length],
  );

  return {
    handleDeleteTask,
    handleCreateTask,
    insertTaskOnEdge,
    addTaskAtPosition,
    onConnect,
    onEdgesDelete,
    onDelete,
  };
}
