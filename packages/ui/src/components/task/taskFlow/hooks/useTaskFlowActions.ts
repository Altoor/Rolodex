import { useCallback } from "react";
import { useMutation } from "@apollo/client/react";
import type { Connection, Edge, XYPosition } from "@xyflow/react";
import {
  CREATE_TASK,
  DELETE_TASK,
  UPDATE_TASK,
  UPDATE_TASKRESULT,
  UPDATE_USER_DECISION_OPTION,
} from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { TaskType } from "@repo/queries/__generated__/graphql";
import type { FlowTask, TaskFlowNode } from "../taskFlowTypes";
import { setResultTaskIdInCache, setTaskFieldInCache, setTaskToolConfigInCache } from "../services/cache";
import {
  parseEdgeId,
  parseSourceHandle,
  type SourceHandle,
} from "../services/connection";
import { setSwitchTarget } from "../services/switch-config";

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
  const [updateUserDecisionOption] = useMutation(UPDATE_USER_DECISION_OPTION, {
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

  // Reusable because both a fresh connection and a rewired edge need it.
  const updateSwitchTarget = useCallback(
    (taskId: number, caseId: string | null, targetTaskId: number | null) => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) return;

      const toolConfig = setSwitchTarget(task.toolConfig, caseId, targetTaskId);
      void updateTask({
        variables: { id: taskId, toolConfig },
        update: (cache) =>
          setTaskToolConfigInCache(cache, taskId, toolConfig),
      });
    },
    [tasks, updateTask],
  );

  // Reusable because both a fresh connection and a rewired edge need it.
  const applyConnection = useCallback(
    (connection: Connection) => {
      const targetTaskId = Number(connection.target);
      if (!Number.isFinite(targetTaskId)) return;

      const sourceHandle = parseSourceHandle(connection.sourceHandle);
      if (!sourceHandle) return;

      if (sourceHandle.kind === "switchTarget") {
        const taskId = Number(connection.source);
        if (!Number.isFinite(taskId)) return;
        updateSwitchTarget(taskId, sourceHandle.caseId, targetTaskId);
        return;
      }

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

      if (sourceHandle.kind === "userDecisionOption") {
        void updateUserDecisionOption({
          variables: {
            id: sourceHandle.optionId,
            resultTaskId: targetTaskId,
          },
          refetchQueries: [TASKS],
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
    [updateTask, updateTaskResult, updateUserDecisionOption, updateSwitchTarget],
  );

  // Connecting an output to another task's input updates the relationship.
  const onConnect = applyConnection;

  // Clears one output relationship, used when a reconnect moves the source end.
  const clearSourceLink = useCallback(
    (sourceTaskId: number, sourceHandle: SourceHandle) => {
      if (!sourceHandle) return;

      if (sourceHandle.kind === "switchTarget") {
        if (!Number.isFinite(sourceTaskId)) return;
        updateSwitchTarget(sourceTaskId, sourceHandle.caseId, null);
        return;
      }

      if (sourceHandle.kind === "taskField") {
        if (!Number.isFinite(sourceTaskId)) return;
        void updateTask({
          variables: { id: sourceTaskId, [sourceHandle.field]: null },
          update: (cache) =>
            setTaskFieldInCache(cache, sourceTaskId, sourceHandle.field, null),
        });
        return;
      }

      if (sourceHandle.kind === "userDecisionOption") {
        void updateUserDecisionOption({
          variables: { id: sourceHandle.optionId, resultTaskId: null },
          refetchQueries: [TASKS],
        });
        return;
      }

      void updateTaskResult({
        variables: { id: sourceHandle.resultId, resultTaskId: null },
        update: (cache) =>
          setResultTaskIdInCache(cache, sourceHandle.resultId, null),
      });
    },
    [updateTask, updateTaskResult, updateUserDecisionOption, updateSwitchTarget],
  );

  // Dragging an existing edge's endpoint rewires it instead of doing nothing.
  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      const oldSourceTaskId = Number(oldEdge.source);
      const oldSourceHandle = parseSourceHandle(oldEdge.sourceHandle);
      const newSourceHandle = parseSourceHandle(connection.sourceHandle);

      applyConnection(connection);

      if (!oldSourceHandle) return;

      // If only the target moved, applying the new connection overwrites the
      // same field. If the source moved, the old relationship must be cleared.
      const sameRelationship =
        oldSourceHandle.kind === newSourceHandle?.kind &&
        ((oldSourceHandle.kind === "taskField" &&
          newSourceHandle?.kind === "taskField" &&
          oldSourceHandle.field === newSourceHandle.field &&
          oldSourceTaskId === Number(connection.source)) ||
          (oldSourceHandle.kind === "taskResult" &&
            newSourceHandle?.kind === "taskResult" &&
            oldSourceHandle.resultId === newSourceHandle.resultId) ||
          (oldSourceHandle.kind === "switchTarget" &&
            newSourceHandle?.kind === "switchTarget" &&
            oldSourceHandle.caseId === newSourceHandle.caseId &&
            oldSourceTaskId === Number(connection.source)) ||
          (oldSourceHandle.kind === "userDecisionOption" &&
            newSourceHandle?.kind === "userDecisionOption" &&
            oldSourceHandle.optionId === newSourceHandle.optionId));

      if (!sameRelationship) {
        clearSourceLink(oldSourceTaskId, oldSourceHandle);
      }
    },
    [applyConnection, clearSourceLink],
  );

  // Deleting an edge clears the matching relationship.
  const onEdgesDelete = useCallback(
    (edges: Edge[]) => {
      for (const edge of edges) {
        const parsed = parseEdgeId(edge.id);
        if (!parsed) continue;

        if (parsed.kind === "switchTarget") {
          updateSwitchTarget(parsed.taskId, parsed.caseId, null);
          continue;
        }

        if (parsed.kind === "taskField") {
          void updateTask({
            variables: { id: parsed.taskId, [parsed.field]: null },
            update: (cache) =>
              setTaskFieldInCache(cache, parsed.taskId, parsed.field, null),
          });
          continue;
        }

        if (parsed.kind === "userDecisionOption") {
          void updateUserDecisionOption({
            variables: { id: parsed.optionId, resultTaskId: null },
            refetchQueries: [TASKS],
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
    [updateTask, updateTaskResult, updateUserDecisionOption, updateSwitchTarget],
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
          // This placeholder continues through its fallback edge until it has
          // results; a no-match user choice would ignore that edge.
          forceUserDecideIfNoMatch: false,
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

        if (sourceHandle.kind === "switchTarget") {
          await updateTask({
            variables: {
              id: sourceTaskId,
              toolConfig: setSwitchTarget(
                tasks.find((task) => task.id === sourceTaskId)?.toolConfig,
                sourceHandle.caseId,
                newTaskId,
              ),
            },
          });
        } else if (sourceHandle.kind === "taskField") {
          await updateTask({
            variables: { id: sourceTaskId, [sourceHandle.field]: newTaskId },
          });
        } else if (sourceHandle.kind === "userDecisionOption") {
          await updateUserDecisionOption({
            variables: { id: sourceHandle.optionId, resultTaskId: newTaskId },
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
      tasks,
      updateTask,
      updateTaskResult,
      updateUserDecisionOption,
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
    onReconnect,
    onEdgesDelete,
    onDelete,
  };
}
