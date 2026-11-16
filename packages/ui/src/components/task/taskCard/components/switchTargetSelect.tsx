import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import type { TaskOption } from "../taskCard.types";
import { NO_TASK } from "./switchTaskConfig";

interface SwitchTargetSelectProps {
  id: string;
  value: string;
  tasks: TaskOption[];
  noTargetLabel: string;
  onChange: (value: string) => void;
}

export function SwitchTargetSelect({
  id,
  value,
  tasks,
  noTargetLabel,
  onChange,
}: SwitchTargetSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? NO_TASK)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a task" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={NO_TASK}>{noTargetLabel}</SelectItem>
          {tasks.map((task) => (
            <SelectItem key={task.id} value={String(task.id)}>
              {task.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
