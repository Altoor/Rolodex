import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "#components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { useFormContext } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";
import { TASK_TYPES } from "../taskCard.types";
import SaveTaskButton from "./saveTaskButton";

interface TaskCardHeaderProps {
  save: () => void;
  saving: boolean;
}

const TaskCardHeader = ({ save, saving }: TaskCardHeaderProps) => {
  const { register, control } = useFormContext<TaskFormValues>();

  return (
    <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <CardContent className="w-full">
        <CardTitle>Task</CardTitle>
        <CardDescription>Set up a task.</CardDescription>
        <Field>
          <SelectController name="type" control={control} defaultValue="decision">
            {(value, onChange) => (
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-(--size-select-sm)">
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
        <SaveTaskButton save={save} saving={saving} />
      </CardAction>
    </CardHeader>
  );
};

export default TaskCardHeader;
