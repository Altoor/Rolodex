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
import { Textarea } from "#components/ui/textarea";
import { useDebouncedFormState } from "#hooks/useDebouncedFormState";
import { useMutation } from "@apollo/client/react";
import { DecisionType } from "@repo/queries/__generated__/graphql";
import {
  CREATE_TASKRESULT,
  UPDATE_TASKRESULT,
} from "@repo/queries/tasks/task-mutations";
import { Save } from "lucide-react";
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
    type: DecisionType;
    scoreThreshold: number | null;
    resultTaskId: number | null;
    confidenceThreshold: number | null;
    option: string | null;
    probabilityThreshold: number | null;
  };
  options: string[];
}

const TaskResultOption = ({ values, options }: TaskResultOptionProps) => {
  const [createTaskResult] = useMutation(CREATE_TASKRESULT);
  const [updateTaskResult] = useMutation(UPDATE_TASKRESULT);

  const [formValues, setFormValues] = useState(values);

  const { register, control } = useDebouncedFormState<Inputs>({
    fieldsToWatch: ["confidenceThreshold", "option"],
    valuesFromFields: (watched) => ({
      confidenceThreshold: watched["confidenceThreshold"] as number,
      option: (watched["option"] as string) ?? "",
    }),
    values,
    setValues: setFormValues,
    delay: 1500,
  });

  const save = () => {
    createTaskResult({
      variables: {
        ...formValues,
        confidenceThreshold: formValues.confidenceThreshold ?? 0,
      },
    });
  };

  return (
    <Item variant={"outline"} className="max-w-60">
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
          <Input {...register("confidenceThreshold", { required: true })} />
        </Field>
        {values.type === "choice" && (
          <Field>
            <SelectController
              name="type"
              control={control}
              defaultValue={"decision" as DecisionType}
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
