"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "#components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Button } from "#components/ui/button";
import { Plus, Save } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { DecisionType, TaskType } from "@repo/queries/__generated__/graphql";
import TaskResultOption from "../taskResultOption/taskResultOption";
import { useDebouncedFormState } from "#hooks/useDebouncedFormState";
import { useState } from "react";

type Inputs = {
  name: string;
  type: TaskType;
};

interface TaskCardProps {
  id?: number;
  values:
    | {
        name: string;
        type: TaskType;
        taskResults?: {
          type: DecisionType;
          taskId: number | null;
          scoreThreshold: number | null;
          resultTaskId: number | null;
          confidenceThreshold: number | null;
          id: number | null;
          option: string | null;
          probabilityThreshold: number | null;
        }[];
        decision?: {
          id: number | null;
          options: string[] | null;
          type: string | null;
        };
      }
    | undefined;
  save: () => void;
  setValues: (variables: { name: string; type: TaskType }) => void;
}

const TaskCard = ({ id, values, save, setValues }: TaskCardProps) => {
  const [taskResults, setTaskResults] = useState(values?.taskResults ?? []);
  const { register, control } = useDebouncedFormState<Inputs>({
    fieldsToWatch: ["name", "type"],
    valuesFromFields: (watched) => ({
      name: (watched["name"] as string) ?? "",
      type: (watched["type"] as TaskType) ?? ("decision" as TaskType),
    }),
    values,
    setValues,
  });

  const typeOfChoice = [
    { label: "Decision", value: "decision" as TaskType },
    { label: "TextPrompt", value: "textPrompt" as TaskType },
    { label: "Tool", value: "tool" as TaskType },
  ];

  return (
    <Card className="w-full">
      <CardHeader className="w-full flex flex-row">
        <CardContent>
          <CardTitle>Task</CardTitle>
          <CardDescription>Setup a Task</CardDescription>
          <Field>
            <SelectController
              name="type"
              control={control}
              defaultValue="decision"
            >
              {(value, onChange) => (
                <>
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {typeOfChoice.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </>
              )}
            </SelectController>
          </Field>
        </CardContent>
        <CardContent className="w-full">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input {...register("name", { required: true })} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardAction>
          <Button onClick={() => save()}>
            <Save></Save>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {values?.type == ("decision" as TaskType) && (
          <>
            <CardTitle>Options</CardTitle>

            <div className="flex flex-row flex-wrap gap-2">
              {taskResults != undefined &&
                Array.from(
                  taskResults.map((taskResult) => (
                    <TaskResultOption
                      values={taskResult}
                      key={taskResult.id}
                      options={values?.decision?.options ?? []}
                    ></TaskResultOption>
                  )),
                )}
              <Button
                className="w-min"
                onClick={() => {
                  const newOption = {
                    type: values?.decision?.type as DecisionType,
                    taskId: id ?? null,
                    scoreThreshold: null,
                    resultTaskId: null,
                    confidenceThreshold: null,
                    id: null,
                    option: null,
                    probabilityThreshold: null,
                  };
                  setTaskResults(taskResults?.concat(newOption));
                }}
              >
                <Plus></Plus>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskCard;
