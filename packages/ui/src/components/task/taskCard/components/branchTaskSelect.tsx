import { Field, FieldLabel } from "#components/ui/field";
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
import { NO_BRANCH_TASK, type TaskFormValues } from "../../task-form";
import type { TaskOption } from "../taskCard.types";

type BranchFieldName = "onTrueTaskId" | "onFalseTaskId";

interface BranchTaskSelectProps {
  name: BranchFieldName;
  label: string;
  tasks: TaskOption[];
}

const BranchTaskSelect = ({ name, label, tasks }: BranchTaskSelectProps) => {
  const { control } = useFormContext<TaskFormValues>();

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <SelectController
        name={name}
        control={control}
        defaultValue={NO_BRANCH_TASK}
      >
        {(value, onChange) => (
          <Select
            value={value ?? NO_BRANCH_TASK}
            onValueChange={onChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NO_BRANCH_TASK}>Stop run</SelectItem>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={String(task.id)}>
                    {task.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </SelectController>
    </Field>
  );
};

export default BranchTaskSelect;
