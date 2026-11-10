import { useEffect, useState } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { GET_DECISION } from "@repo/queries/decisions/decision-queries";
import { GET_TASK } from "@repo/queries/tasks/task-queries";
import { DecisionType } from "@repo/queries/__generated__/graphql";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import {
  emptyTaskFormValues,
  taskToFormValues,
  type TaskFormValues,
} from "../../task-form";

/** Owns the builder form, the field array and task/decision loading. */
export function useTaskBuilderForm(selectedTaskId: number | undefined) {
  const methods = useForm<TaskFormValues>({
    defaultValues: emptyTaskFormValues,
  });
  const { getValues, reset, setValue, control } = methods;
  const type = useWatch({ control, name: "type" });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "taskResults",
  });

  const [getTask, { error: loadError }] = useLazyQuery(GET_TASK);
  const [getDecision] = useLazyQuery(GET_DECISION);
  const [selectedDecisionId, setSelectedDecisionId] = useState<
    number | undefined
  >(undefined);
  const [createdTaskId, setCreatedTaskId] = useState<number | undefined>(
    undefined,
  );

  const taskId = selectedTaskId ?? createdTaskId;

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

  return {
    methods,
    getValues,
    reset,
    setValue,
    type,
    fields,
    append,
    remove,
    selectedDecisionId,
    setSelectedDecisionId,
    taskId,
    setCreatedTaskId,
    loadError,
  };
}
