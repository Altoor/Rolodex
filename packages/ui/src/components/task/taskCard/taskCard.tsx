"use client";

import {
  Card,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
  CardHeader,
} from "#components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { useForm, type Control } from "react-hook-form";
import { useCallback, useEffect } from "react";
import { Button } from "#components/ui/button";
import { Save } from "lucide-react";
import { debounce } from "#lib/debounce";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { TaskType } from "@repo/queries/__generated__/graphql";

type Inputs = {
  name: string;
  type: TaskType;
};

interface TaskCardProps {
  values:
    | {
        name: string;
        type: TaskType;
      }
    | undefined;
  save: () => void;
  setValues: (variables: { name: string; type: TaskType }) => void;
}

const TaskCard = ({ values, save, setValues }: TaskCardProps) => {
  const { register, reset, watch, control } = useForm<Inputs>({
    defaultValues: { name: "", type: "decision" as TaskType },
  });

  useEffect(() => {
    reset({ name: values?.name, type: values?.type });
    console.log(values);
  }, [values, reset]);

  const debouncedSetValues = useCallback(
    (variables: { name: string; type: TaskType }) => {
      debounce(() => {
        setValues({ ...variables });
        console.log(variables);
      }, 500)();
    },
    [watch],
  );

  useEffect(() => {
    const { unsubscribe } = watch(({ name, type }) => {
      const currentValues = {
        name: name ?? "",
        type: type ?? ("decision" as TaskType),
      };

      debouncedSetValues(currentValues);
    });
    return () => unsubscribe();
  }, [watch, debouncedSetValues]);

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
    </Card>
  );
};

export default TaskCard;
