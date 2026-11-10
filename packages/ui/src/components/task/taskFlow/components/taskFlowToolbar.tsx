import { Plus } from "lucide-react";
import { Button } from "#components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import type { FlowTask } from "../taskFlowTypes";

interface TaskFlowToolbarProps {
  tasks: FlowTask[];
  effectiveRootId: number | undefined;
  onRootChange: (taskId: number) => void;
  onCreateTask: () => void;
}

const TaskFlowToolbar = ({
  tasks,
  effectiveRootId,
  onRootChange,
  onCreateTask,
}: TaskFlowToolbarProps) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">First task</span>
    <Select
      value={effectiveRootId != null ? String(effectiveRootId) : ""}
      onValueChange={(value) => onRootChange(Number(value))}
    >
      <SelectTrigger className="w-(--size-flow-root-select)">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {tasks.map((task) => (
            <SelectItem key={task.id} value={String(task.id)}>
              {task.name ?? "Untitled task"}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
    <Button onClick={onCreateTask}>
      New Task <Plus />
    </Button>
  </div>
);

export default TaskFlowToolbar;
