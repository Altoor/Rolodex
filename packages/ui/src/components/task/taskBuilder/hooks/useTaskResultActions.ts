import { useMutation } from "@apollo/client/react";
import {
  CREATE_TASKRESULT,
  DELETE_TASKRESULT,
  UPDATE_TASKRESULT,
} from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import type { UseFieldArrayAppend, UseFieldArrayRemove, UseFormReturn } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";
import { buildTaskResultVariables } from "../task-builder-service";

interface UseTaskResultActionsArgs {
  methods: UseFormReturn<TaskFormValues>;
  taskId: number | undefined;
  append: UseFieldArrayAppend<TaskFormValues, "taskResults">;
  remove: UseFieldArrayRemove;
}

/** Adds, saves and deletes the decision result branches. */
export function useTaskResultActions({
  methods,
  taskId,
  append,
  remove,
}: UseTaskResultActionsArgs) {
  const { getValues, setValue } = methods;

  const [createTaskResult, { error: createResultError }] = useMutation(
    CREATE_TASKRESULT,
    { refetchQueries: [TASKS] },
  );
  const [updateTaskResult, { error: updateResultError }] = useMutation(
    UPDATE_TASKRESULT,
    { refetchQueries: [TASKS] },
  );
  const [deleteTaskResult, { error: deleteResultError }] = useMutation(
    DELETE_TASKRESULT,
    { refetchQueries: [TASKS] },
  );

  const addTaskResult = () => {
    const decision = getValues("decision");

    append({
      id: null,
      type: decision?.type ?? "noul",
      taskId: taskId ?? null,
      scoreThreshold: null,
      resultTaskId: null,
      confidenceThreshold: null,
      option: decision?.options[0] ?? null,
      probabilityThreshold: null,
    });
  };

  const saveTaskResult = async (index: number) => {
    if (taskId === undefined) return;

    const result = getValues(`taskResults.${index}`);
    const variables = buildTaskResultVariables(result, taskId);

    if (result.id != null) {
      await updateTaskResult({
        variables: { ...variables, id: result.id },
      });
      return;
    }

    const { data } = await createTaskResult({ variables });
    const createdId = data?.createTaskResult?.id;

    if (createdId != null) {
      setValue(`taskResults.${index}.id`, createdId);
    }
  };

  const deleteTaskResultAt = async (index: number) => {
    const result = getValues(`taskResults.${index}`);

    if (result.id != null) {
      await deleteTaskResult({ variables: { id: result.id } });
    }

    remove(index);
  };

  return {
    addTaskResult,
    saveTaskResult,
    deleteTaskResultAt,
    resultError: createResultError ?? updateResultError ?? deleteResultError,
  };
}
