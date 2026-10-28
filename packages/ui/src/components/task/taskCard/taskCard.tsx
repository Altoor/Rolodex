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
import { useForm } from "react-hook-form";
import { useCallback, useEffect } from "react";
import { Button } from "#components/ui/button";
import { Save } from "lucide-react";
import { debounce } from "#lib/debounce";
import {
  Select,
  SelectContent,
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
  const { register, reset, watch } = useForm<Inputs>();

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
        type: type ?? "decision",
      };

      debouncedSetValues(currentValues);
    });
    return () => unsubscribe();
  }, [watch, debouncedSetValues]);

  const typeOfChoice = [
    { label: "Decision", value: "decision" },
    { label: "TextPrompt", value: "textPrompt" },
    { label: "Tool", value: "tool" },
  ];
  return (
    <Card className="w-full">
      <form {...form}>
        <CardHeader className="w-full flex flex-row">
          <CardContent>
            <CardTitle>Task</CardTitle>
            <CardDescription>Setup a Task</CardDescription>
            <Field>
              <Select
                items={typeOfChoice}
                defaultValue={"decision"}
                {...register("type", { required: true })}
              >
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
      </form>
    </Card>
  );
};

export default TaskCard;
