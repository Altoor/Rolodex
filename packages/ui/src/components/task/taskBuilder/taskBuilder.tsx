"use client";

import { useMemo, useState } from "react";
import { ErrorState } from "#components/feedback/error-state";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client/react";
import { MODELS } from "@repo/queries/model/model-queries";
import { TASKS, GET_TASK } from "@repo/queries/tasks/task-queries";
import { TOOLS } from "@repo/queries/tools/tool-queries";
import {
  CREATE_TASKRESULT,
  CREATE_TASK,
  DELETE_TASKRESULT,
  UPDATE_TASKRESULT,
  UPDATE_TASK,
} from "@repo/queries/tasks/task-mutations";
import { GET_DECISION } from "@repo/queries/decisions/decision-queries";
import type { DecisionType } from "@repo/queries/__generated__/graphql";
import { useLoadedEntity } from "#hooks/useLoadedEntity";
import { useSaveEntity } from "#hooks/useSaveEntity";
import TaskCard from "../taskCard/taskCard";
import {
  emptyTaskFormValues,
  taskToFormValues,
  type TaskFormValues,
} from "../task-form";
import {
  buildTaskResultVariables,
  buildTaskVariables,
  toBranchTaskOptions,
  toModelNames,
} from "./task-builder-service";
import TaskDecisionSection from "./components/taskDecisionSection";

interface TaskBuilderProps {
  selectedTaskId: number | undefined;
}

const TaskBuilder = ({ selectedTaskId }: TaskBuilderProps) => {
  const methods = useForm<TaskFormValues>({
    defaultValues: emptyTaskFormValues,
  });
  const { control, getValues, reset, setValue } = methods;
  const type = useWatch({ control, name: "type" });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "taskResults",
  });

  const [selectedDecisionId, setSelectedDecisionId] = useState<
    number | undefined
  >(undefined);
  const [createdTaskId, setCreatedTaskId] = useState<number | undefined>(
    undefined,
  );
  const taskId = selectedTaskId ?? createdTaskId;

  const { data: toolsData } = useQuery(TOOLS);
  const { data: modelsData } = useQuery(MODELS);
  const { data: tasksData } = useQuery(TASKS);

  const tools = toolsData?.tools ?? [];
  const branchTasks = useMemo(
    () => toBranchTaskOptions(tasksData?.tasks),
    [tasksData],
  );
  const models = useMemo(() => toModelNames(modelsData?.models), [modelsData]);

  const [getTask, { error: loadError }] = useLazyQuery(GET_TASK);
  const [getDecision] = useLazyQuery(GET_DECISION);

  useLoadedEntity({
    id: selectedTaskId,
    load: async (id) => (await getTask({ variables: { id } })).data?.getTask,
    onLoaded: (task) => {
      if (!task) {
        reset(emptyTaskFormValues);
        setSelectedDecisionId(undefined);
        return;
      }

      reset(taskToFormValues(task));
      setSelectedDecisionId(task.decision?.id ?? undefined);
    },
  });

  useLoadedEntity({
    id: selectedDecisionId,
    load: async (id) =>
      (await getDecision({ variables: { id } })).data?.getDecision,
    onLoaded: (decision) => {
      if (!decision) {
        setValue("decision", null);
        return;
      }

      setValue("decision", {
        id: decision.id ?? selectedDecisionId ?? 0,
        type: (decision.type as DecisionType | null) ?? "noul",
        options: decision.options ?? [],
      });
    },
  });

  const [createTask, { error: createError, loading: creatingTask }] =
    useMutation(CREATE_TASK, { refetchQueries: [TASKS] });
  const [updateTask, { error: updateError, loading: updatingTask }] =
    useMutation(UPDATE_TASK, { refetchQueries: [TASKS] });

  const saveTask = useSaveEntity({
    form: methods,
    id: taskId,
    toVariables: (values) => buildTaskVariables(values, selectedDecisionId),
    create: (variables) => createTask({ variables }),
    update: (variables) => updateTask({ variables }),
    onCreated: (data, values) => {
      const createdId = data?.createTask?.id;
      if (createdId == null) return;

      setCreatedTaskId(createdId);
      setValue(
        "taskResults",
        values.taskResults.map((result) => ({
          ...result,
          taskId: createdId,
        })),
      );
    },
    onBuildError: (error) => {
      methods.setError("toolConfigText", {
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });

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

  const error =
    loadError ??
    createError ??
    updateError ??
    createResultError ??
    updateResultError ??
    deleteResultError;

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col gap-2">
        {error ? (
          <ErrorState title="Task operation failed" error={error} />
        ) : null}
        <TaskCard
          resultFields={fields}
          tools={tools}
          tasks={branchTasks}
          models={models}
          save={saveTask}
          saving={creatingTask || updatingTask}
          canEditResults={taskId !== undefined}
          onAddResult={addTaskResult}
          onSaveResult={saveTaskResult}
          onDeleteResult={deleteTaskResultAt}
        />
        <TaskDecisionSection
          type={type}
          selectedDecisionId={selectedDecisionId}
          onSelectDecision={setSelectedDecisionId}
        />
      </div>
    </FormProvider>
  );
};

export default TaskBuilder;
