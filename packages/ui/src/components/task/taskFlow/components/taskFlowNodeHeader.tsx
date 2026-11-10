import { X } from "lucide-react";
import type { TaskFlowNodeData } from "../taskFlowTypes";

interface TaskFlowNodeHeaderProps {
  data: TaskFlowNodeData;
}

const TaskFlowNodeHeader = ({ data }: TaskFlowNodeHeaderProps) => (
  <>
    <button
      type="button"
      className="nodrag nopan absolute right-2 top-2 text-muted-foreground hover:text-destructive"
      title="Delete task"
      aria-label="Delete task"
      onClick={(event) => {
        event.stopPropagation();
        data.onTaskDelete?.(data.taskId);
      }}
    >
      <X className="size-4" />
    </button>

    <p className="text-xs tracking-wide text-muted-foreground uppercase">
      {data.type === "tool" ? "Tool" : "Task"}
    </p>
    <p className="text-sm font-medium">{data.name}</p>
    {data.type === "tool" && data.toolKey ? (
      <p className="text-xs text-muted-foreground">Tool · {data.toolKey}</p>
    ) : null}
    {data.model ? (
      <p className="text-xs text-muted-foreground">Model · {data.model}</p>
    ) : null}
    {data.decisionModel ? (
      <p className="text-xs text-muted-foreground">
        Decision · {data.decisionModel}
      </p>
    ) : null}
  </>
);

export default TaskFlowNodeHeader;
