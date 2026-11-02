"use client";

import { Button } from "#components/ui/button";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item, ItemActions, ItemContent } from "#components/ui/item";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { useDebouncedFormState } from "#hooks/useDebouncedFormState";
import { useMutation } from "@apollo/client/react";
import { DecisionType } from "@repo/queries/__generated__/graphql";
import {
  CREATE_TASKRESULT,
  DELETE_TASKRESULT,
  UPDATE_TASKRESULT,
} from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { Save, X } from "lucide-react";
import { useState } from "react";

type Inputs = {
  type: DecisionType;
  scoreThreshold: number | null;
  resultTaskId: number | null;
  confidenceThreshold: number | null;
  option: string | null;
  probabilityThreshold: number | null;
};

interface TaskResultOptionProps {
  values: {
    id: number | null;
    type: DecisionType;
    taskId: number;
    scoreThreshold: number | null;
    resultTaskId: number | null;
    confidenceThreshold: number | null;
    option: string | null;
    probabilityThreshold: number | null;
  };
  options: string[];
  onDelete: () => void;
}

const TaskResultOption = ({ values, options, onDelete }: TaskResultOptionProps) => {
  const [createTaskResult, { client }] = useMutation(CREATE_TASKRESULT);
  const [deleteTaskResult] = useMutation(DELETE_TASKRESULT);
  const [updateTaskResult] = useMutation(UPDATE_TASKRESULT);

  const [formValues, setFormValues] = useState(values);

  const { register, control } = useDebouncedFormState<Inputs>({
    fieldsToWatch: ["confidenceThreshold", "option"],
    valuesFromFields: (watched) => ({
      confidenceThreshold:
        parseFloat(watched["confidenceThreshold"] as string) || 0,
      option: (watched["option"] as string) ?? options[0],
    }),
    values,
    setValues: setFormValues,
    delay: 500,
  });

  client.refetchQueries({ include: [TASKS] });

  const save = () => {
    const { id, ...restValues } = values;
    const variables = {
      ...restValues,
      ...formValues,
      confidenceThreshold: formValues.confidenceThreshold ?? 0,
    };

    if (id != null) {
      updateTaskResult({
        variables: {
          ...variables,
          id,
        },
      });
    } else {
      createTaskResult({
        variables,
      });
    }
  };

  return (
    <Item variant={"outline"} className="relative max-w-60">
      <button
        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
        onClick={() => {
          if (values.id != null) {
            deleteTaskResult({
              variables: {
                id: values.id,
              },
            });
          }
          onDelete();
        }}
      >
        <X className="size-4" />
      </button>
      <ItemContent>
        <ItemActions>
          <Button onClick={() => save()}>
            <Save></Save>
          </Button>
        </ItemActions>
      </ItemContent>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="confidenceThreshold">
            ConfidenceThreshold
          </FieldLabel>
          <Input
            type="number"
            {...register("confidenceThreshold", { required: true })}
          />
        </Field>
        {values.type === "choice" && (
          <Field>
            <SelectController
              name="option"
              control={control}
              defaultValue={options[0]}
            >
              {(value, onChange) => (
                <>
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </>
              )}
            </SelectController>
          </Field>
        )}
      </FieldGroup>
    </Item>
  );
};

export default TaskResultOption;
