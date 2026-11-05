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
import { Spinner } from "#components/ui/spinner";
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
import type { FieldArrayWithId } from "react-hook-form";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../task-form";
import TaskResultOption from "../taskResultOption/taskResultOption";
import { TaskType } from "@repo/queries/__generated__/graphql";

const TASK_TYPES = [
  { label: "Decision", value: "decision" as TaskType },
  { label: "TextPrompt", value: "textPrompt" as TaskType },
  { label: "Tool", value: "tool" as TaskType },
];

interface TaskCardProps {
  resultFields: FieldArrayWithId<TaskFormValues, "taskResults", "id">[];
  save: () => void;
  saving?: boolean;
  canEditResults: boolean;
  onAddResult: () => void;
  onSaveResult: (index: number) => void;
  onDeleteResult: (index: number) => void;
}

const TaskCard = ({
  resultFields,
  save,
  saving = false,
  canEditResults,
  onAddResult,
  onSaveResult,
  onDeleteResult,
}: TaskCardProps) => {
  const { register, control } = useFormContext<TaskFormValues>();
  const type = useWatch({ control, name: "type" });
  const decision = useWatch({ control, name: "decision" });

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <CardContent className="w-full">
          <CardTitle>Task</CardTitle>
          <CardDescription>Set up a task.</CardDescription>
          <Field>
            <SelectController
              name="type"
              control={control}
              defaultValue="decision"
            >
              {(value, onChange) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TASK_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </SelectController>
          </Field>
        </CardContent>
        <CardContent className="w-full">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-name">Name</FieldLabel>
              <Input id="task-name" {...register("name", { required: true })} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardAction>
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            title="Save task"
            aria-label="Save task"
          >
            {saving ? <Spinner /> : <Save />}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {type === "decision" ? (
          <div className="flex flex-col gap-3">
            <CardTitle>Results</CardTitle>
            {!canEditResults ? (
              <p className="text-sm text-muted-foreground">
                Save the task before adding result branches.
              </p>
            ) : (
              <>
                <div className="flex flex-row flex-wrap gap-2">
                  {resultFields.map((field, index) => (
                    <TaskResultOption
                      key={field.id}
                      index={index}
                      options={decision?.options ?? []}
                      onSave={() => onSaveResult(index)}
                      onDelete={() => onDeleteResult(index)}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  className="w-min"
                  onClick={onAddResult}
                  title="Add result"
                  aria-label="Add result"
                >
                  <Plus />
                </Button>
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default TaskCard;
