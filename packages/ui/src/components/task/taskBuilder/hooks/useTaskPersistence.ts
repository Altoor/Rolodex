import { useMutation } from "@apollo/client/react";
import { CREATE_TASK, UPDATE_TASK } from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import type { UseFormReturn } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";
import { buildTaskVariables } from "../task-builder-service";

interface UseTaskPersistenceArgs {
  methods: UseFormReturn<TaskFormValues>;
  taskId: number | undefined;
  selectedDecisionId: number | undefined;
  onCreatedTaskId: (id: number) => void;
}

/** Saves the task itself (create or update). */
export function useTaskPersistence({
  methods,
  taskId,
  selectedDecisionId,
  onCreatedTaskId,
}: UseTaskPersistenceArgs) {
  const [createTask, { error: createError, loading: creatingTask }] =
    useMutation(CREATE_TASK, { refetchQueries: [TASKS] });
  const [updateTask, { error: updateError, loading: updatingTask }] =
    useMutation(UPDATE_TASK, { refetchQueries: [TASKS] });

  const saveTask = methods.handleSubmit(async (values) => {
    if (values.type === "tool" && !values.toolKey) {
      methods.setError("toolKey", { message: "select a tool" });
      return;
    }

    let taskVariables;
    try {
      taskVariables = buildTaskVariables(values, selectedDecisionId);
    } catch (err) {
      methods.setError("toolConfigText", {
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (taskId !== undefined) {
      await updateTask({ variables: { ...taskVariables, id: taskId } });
      return;
    }

    const { data } = await createTask({ variables: taskVariables });
    const createdId = data?.createTask?.id;

    if (createdId != null) {
      onCreatedTaskId(createdId);
      methods.setValue(
        "taskResults",
        values.taskResults.map((result) => ({
          ...result,
          taskId: createdId,
        })),
      );
    }
  });

  return {
    saveTask,
    creatingTask,
    updatingTask,
    persistenceError: createError ?? updateError,
  };
}
