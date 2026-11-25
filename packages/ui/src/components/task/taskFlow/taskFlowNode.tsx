"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "#lib/utils";
import type { TaskFlowNode } from "./taskFlowTypes";
import TaskFlowNodeHandles from "./components/taskFlowNodeHandles";
import TaskFlowNodeHeader from "./components/taskFlowNodeHeader";

const TaskFlowNode = ({ data, selected }: NodeProps<TaskFlowNode>) => {
  return (
    <div
      className={cn(
        "relative min-w-52 rounded-lg border bg-card p-3 text-card-foreground shadow-sm",
        // Tasks between a foreach fan-out and its join barrier are marked so
        // the fan-in boundary is visible at a glance.
        data.fannedOut && "border-blue-300 dark:border-blue-300",
        selected && "border-primary ring-2 ring-primary/30",
      )}
    >
      {/* Every task node has a single input */}
      <Handle type="target" position={Position.Left} id="input" />

      <TaskFlowNodeHeader data={data} />
      <TaskFlowNodeHandles data={data} />
    </div>
  );
};

export default TaskFlowNode;
