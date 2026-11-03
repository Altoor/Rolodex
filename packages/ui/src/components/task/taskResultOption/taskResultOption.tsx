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

/** Parses a form field into a number, or null when empty/invalid. */
const parseNullableFloat = (value: unknown): number | null => {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const TaskResultOption = ({
  values,
  options,
  onDelete,
}: TaskResultOptionProps) => {
  const [createTaskResult, { client }] = useMutation(CREATE_TASKRESULT);
  const [deleteTaskResult] = useMutation(DELETE_TASKRESULT);
  const [updateTaskResult] = useMutation(UPDATE_TASKRESULT);

  const [formValues, setFormValues] = useState(values);

  const { register, control, watch, setValue } =
    useDebouncedFormState<Inputs>({
      fieldsToWatch: [
        "confidenceThreshold",
        "option",
        "scoreThreshold",
        "probabilityThreshold",
      ],
      valuesFromFields: (watched) => ({
        confidenceThreshold: parseNullableFloat(
          watched["confidenceThreshold"],
        ),
        scoreThreshold: parseFloat(watched["scoreThreshold"] as string) || 0,
        probabilityThreshold:
          parseFloat(watched["probabilityThreshold"] as string) || 0,
        option: (watched["option"] as string) ?? options[0],
      }),
      values,
      setValues: setFormValues,
      delay: 500,
    });

  const confidenceInput = watch("confidenceThreshold");
  const hasConfidence =
    confidenceInput != null && String(confidenceInput).trim() !== "";

  client.refetchQueries({ include: [TASKS] });

  const save = () => {
    const { id, ...restValues } = values;
    const variables = {
      ...restValues,
      ...formValues,
      confidenceThreshold: formValues.confidenceThreshold ?? null,
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
          <div className="flex items-center gap-1">
            <Input type="number" {...register("confidenceThreshold")} />
            {hasConfidence && (
              <Button
                variant="ghost"
                size="icon-xs"
                title="Remove confidence threshold"
                onClick={() => setValue("confidenceThreshold", null)}
              >
                <X className="size-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </Field>

        {values.type === "score" && (
          <Field>
            <FieldLabel htmlFor="scoreThreshold">scoreThreshold</FieldLabel>
            <Input
              type="number"
              {...register("scoreThreshold", { required: true })}
            />
          </Field>
        )}
        {values.type === "choice" && (
          <>
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

            <Field>
              <FieldLabel htmlFor="probabilityThreshold">
                probabilityThreshold
              </FieldLabel>
              <Input
                type="number"
                {...register("probabilityThreshold", { required: true })}
              />
            </Field>
          </>
        )}
      </FieldGroup>
    </Item>
  );
};

export default TaskResultOption;
