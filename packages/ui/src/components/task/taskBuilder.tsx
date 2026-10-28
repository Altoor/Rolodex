"use client";

import DecisionBuilder from "#components/decision/decisionBuilder";
import DecisionList from "#components/decision/decisionList/decisionList";
import { Button } from "#components/ui/button";
import { useLazyQuery, useMutation } from "@apollo/client/react";
import { CREATE_TASK, UPDATE_TASK } from "@repo/queries/tasks/task-mutations";
import { GET_TASK, TASKS } from "@repo/queries/tasks/task-queries";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import TaskCard from "./taskCard/taskCard";
import { TaskType } from "@repo/queries/__generated__/graphql";

interface TaskBuilderProps {
  selectedTaskId: number | undefined;
}

const TaskBuilder = ({ selectedTaskId }: TaskBuilderProps) => {
  const [getTask, { loading, error, data, client }] = useLazyQuery(GET_TASK);
  const [selectedDecisionId, setSelectedDecisionId] = useState<
    number | undefined
  >(undefined);
  const [createTask] = useMutation(CREATE_TASK);
  const [updateTask] = useMutation(UPDATE_TASK);

  const [formValues, setFormValues] = useState<
    | {
        name: string;
        type: TaskType;
      }
    | undefined
  >(undefined);

  const [loadedValues, setLoadedValues] = useState<
    | {
        name: string;
        type: TaskType;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    if (selectedTaskId !== undefined) {
      const getValues = async () => {
        const task = await getTask({
          variables: { id: selectedTaskId },
        });

        if (task.data?.getTask) {
          setLoadedValues({
            name: task.data?.getTask.name ?? "",
            type: task.data?.getTask.type as TaskType,
          });
          setSelectedDecisionId(task.data?.getTask.decisionId ?? undefined);
        }
      };

      getValues();
    } else {
      setLoadedValues({
        name: "",
        type: "decision",
      });
    }
  }, [getTask, selectedTaskId]);

  const saveTask = (value: { name: string; type: TaskType }) => {
    if (selectedDecisionId) {
      if (selectedTaskId) {
        updateTask({
          variables: {
            ...value,
            id: selectedTaskId,
            decisionId: selectedDecisionId,
          },
        });
      } else {
        createTask({
          variables: {
            ...value,
            decisionId: selectedDecisionId,
          },
        });
      }
    }

    client.refetchQueries({
      include: [TASKS],
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <TaskCard
        values={loadedValues}
        save={() => {
          if (formValues) {
            saveTask({ ...formValues });
          }
        }}
        setValues={(value) => {
          setFormValues(value);
        }}
      ></TaskCard>
      {selectedDecisionId ? (
        <>
          <Button
            onClick={() => {
              setSelectedDecisionId(undefined);
            }}
          >
            Select another decision <Pencil />
          </Button>
          <DecisionBuilder
            selectedDecisionId={selectedDecisionId}
          ></DecisionBuilder>
        </>
      ) : (
        <>
          <DecisionList
            selectedDecisionId={undefined}
            setSelectedDecisionId={setSelectedDecisionId}
          ></DecisionList>
          <DecisionBuilder
            selectedDecisionId={selectedDecisionId}
          ></DecisionBuilder>
        </>
      )}
    </div>
  );
};

export default TaskBuilder;
