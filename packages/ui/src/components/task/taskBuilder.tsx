"use client";

import DecisionBuilder from "#components/decision/decisionBuilder";
import DecisionList from "#components/decision/decisionList/decisionList";
import { ErrorState } from "#components/feedback/error-state";
import { Button } from "#components/ui/button";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client/react";
import { GET_DECISION } from "@repo/queries/decisions/decision-queries";
import { MODELS } from "@repo/queries/model/model-queries";
import { TOOLS } from "@repo/queries/tools/tool-queries";
import {
  CREATE_TASK,
  CREATE_TASKRESULT,
  DELETE_TASKRESULT,
  UPDATE_TASK,
  UPDATE_TASKRESULT,
} from "@repo/queries/tasks/task-mutations";
import { GET_TASK, TASKS } from "@repo/queries/tasks/task-queries";
import { DecisionType } from "@repo/queries/__generated__/graphql";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import TaskCard from "./taskCard/taskCard";
import {
  emptyTaskFormValues,
  NO_BRANCH_TASK,
  taskToFormValues,
  USE_USER_DEFAULT_MODEL,
  type TaskFormValues,
} from "./task-form";

interface TaskBuilderProps {
  selectedTaskId: number | undefined;
}

const TaskBuilder = ({ selectedTaskId }: TaskBuilderProps) => {
  const methods = useForm<TaskFormValues>({
    defaultValues: emptyTaskFormValues,
  });
  const { getValues, reset, setValue, control } = methods;
  const type = useWatch({ control, name: "type" });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "taskResults",
  });

  const { data: toolsData } = useQuery(TOOLS);
  const { data: modelsData } = useQuery(MODELS);
  const { data: tasksData } = useQuery(TASKS);
  const tools = toolsData?.tools ?? [];
  const branchTasks = (tasksData?.tasks ?? []).flatMap((task) =>
    task?.id != null
      ? [{ id: task.id, name: task.name ?? "Untitled task" }]
      : [],
  );
  const models = (modelsData?.models ?? []).flatMap((model) =>
    model.pulled && model.name ? [model.name] : [],
  );

  const [getTask, { error: loadError }] = useLazyQuery(GET_TASK);
  const [getDecision] = useLazyQuery(GET_DECISION);
  const [selectedDecisionId, setSelectedDecisionId] = useState<
    number | undefined
  >(undefined);
  const [createdTaskId, setCreatedTaskId] = useState<number | undefined>(
    undefined,
  );
  const taskId = selectedTaskId ?? createdTaskId;

  const [createTask, { error: createError, loading: creatingTask }] =
    useMutation(CREATE_TASK, { refetchQueries: [TASKS] });
  const [updateTask, { error: updateError, loading: updatingTask }] =
    useMutation(UPDATE_TASK, { refetchQueries: [TASKS] });
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

  useEffect(() => {
    let cancelled = false;

    if (selectedTaskId === undefined) {
      reset(emptyTaskFormValues);
      return () => {
        cancelled = true;
      };
    }

    void getTask({ variables: { id: selectedTaskId } }).then(({ data }) => {
      if (cancelled || !data?.getTask) return;

      reset(taskToFormValues(data.getTask));
      setSelectedDecisionId(data.getTask.decision?.id ?? undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [getTask, reset, selectedTaskId]);

  useEffect(() => {
    let cancelled = false;

    if (selectedDecisionId === undefined) {
      setValue("decision", null);
      return () => {
        cancelled = true;
      };
    }

    const current = getValues("decision");
    if (current?.id === selectedDecisionId) return;

    void getDecision({ variables: { id: selectedDecisionId } }).then(
      ({ data }) => {
        const decision = data?.getDecision;
        if (cancelled || !decision) return;

        setValue("decision", {
          id: decision.id ?? selectedDecisionId,
          type: (decision.type as DecisionType | null) ?? "noul",
          options: decision.options ?? [],
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [getDecision, getValues, selectedDecisionId, setValue]);

  const parseBranchTaskId = (value: string): number | null => {
    if (!value || value === NO_BRANCH_TASK) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const saveTask = methods.handleSubmit(async (values) => {
    if (values.type === "tool" && !values.toolKey) {
      methods.setError("toolKey", { message: "select a tool" });
      return;
    }

    let toolConfig: Record<string, unknown> | null = null;

    if (values.type === "tool" && values.toolConfigText.trim()) {
      try {
        const parsed: unknown = JSON.parse(values.toolConfigText);
        if (
          parsed === null ||
          typeof parsed !== "object" ||
          Array.isArray(parsed)
        ) {
          throw new Error("toolConfig must be a JSON object");
        }
        toolConfig = parsed as Record<string, unknown>;
      } catch (err) {
        methods.setError("toolConfigText", {
          message: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }

    const isIfTool = values.type === "tool" && values.toolKey === "if";
    const taskVariables = {
      name: values.name,
      type: values.type,
      decisionId: values.type === "decision" ? selectedDecisionId : undefined,
      toolKey: values.type === "tool" ? values.toolKey : null,
      toolConfig,
      toolOutputType:
        values.type === "tool" ? values.toolOutputType : ("normal" as const),
      onTrueTaskId: isIfTool ? parseBranchTaskId(values.onTrueTaskId) : null,
      onFalseTaskId: isIfTool ? parseBranchTaskId(values.onFalseTaskId) : null,
      model: values.model === USE_USER_DEFAULT_MODEL ? null : values.model,
      decisionModel:
        values.decisionModel === USE_USER_DEFAULT_MODEL
          ? null
          : values.decisionModel,
    };

    if (taskId !== undefined) {
      await updateTask({ variables: { ...taskVariables, id: taskId } });
      return;
    }

    const { data } = await createTask({ variables: taskVariables });
    const createdId = data?.createTask?.id;

    if (createdId != null) {
      setCreatedTaskId(createdId);
      setValue(
        "taskResults",
        values.taskResults.map((result) => ({
          ...result,
          taskId: createdId,
        })),
      );
    }
  });

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
    const variables = {
      type: result.type,
      taskId,
      confidenceThreshold: result.confidenceThreshold ?? null,
      probabilityThreshold: result.probabilityThreshold ?? null,
      scoreThreshold: result.scoreThreshold ?? null,
      resultTaskId: result.resultTaskId ?? null,
      option: result.option ?? null,
    };

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
        {type === "decision" ? (
          selectedDecisionId !== undefined ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => {
                  setSelectedDecisionId(undefined);
                }}
              >
                Select another decision <Pencil />
              </Button>
              <DecisionBuilder selectedDecisionId={selectedDecisionId} />
            </>
          ) : (
            <>
              <DecisionList
                selectedDecisionId={undefined}
                setSelectedDecisionId={setSelectedDecisionId}
              />
              <DecisionBuilder selectedDecisionId={undefined} />
            </>
          )
        ) : null}
      </div>
    </FormProvider>
  );
};

export default TaskBuilder;
