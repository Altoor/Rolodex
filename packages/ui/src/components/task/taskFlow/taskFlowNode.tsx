"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { cn } from "#lib/utils";
import {
  FALLBACK_HANDLE_ID,
  type FlowTaskResult,
  type TaskFlowNode,
} from "./taskFlowTypes";

const resultLabel = (
  result: FlowTaskResult,
  decisionType: string | null,
  index: number,
) => {
  // "P:" only applies to choice decisions and "S:" only to score decisions.
  // Each threshold is only shown when it is defined; confidence ("C:") is a
  // modifier shown alongside for any decision type.
  const parts: string[] = [];
  if (decisionType === "score") {
    if (result.scoreThreshold != null) {
      parts.push(`S: ${result.scoreThreshold}`);
    }
  } else {
    parts.push(result.option ?? `Result ${index + 1}`);
    if (decisionType === "choice" && result.probabilityThreshold != null) {
      parts.push(`P: ${result.probabilityThreshold}`);
    }
  }
  if (result.confidenceThreshold != null) {
    parts.push(`C: ${result.confidenceThreshold}`);
  }
  return parts.length > 0 ? parts.join(" · ") : `Result ${index + 1}`;
};

const TaskFlowNode = ({ data, selected }: NodeProps<TaskFlowNode>) => {
  return (
    <div
      className={cn(
        "relative min-w-52 rounded-lg border bg-card p-3 text-card-foreground shadow-sm",
        selected && "border-primary ring-2 ring-primary/30",
      )}
    >
      {/* Every task node has a single input */}
      <Handle type="target" position={Position.Left} id="input" />

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
        Task
      </p>
      <p className="mb-2 text-sm font-medium">{data.name}</p>

      {/* One output per TaskResult this task has. Each row is positioned so
          the (absolute) handle is centered on its own row instead of on the
          whole node. */}
      <div className="flex flex-col gap-1">
        {data.taskResults.length > 0 ? (
          data.taskResults.map((result, index) => (
            <div
              key={result.id ?? index}
              className="relative flex items-center justify-between gap-2 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground"
            >
              <span>{resultLabel(result, data.decisionType, index)}</span>
              {result.id != null && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={String(result.id)}
                />
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground/60">
            No results — add a result to connect this task to another.
          </p>
        )}
        {/* Every task also has a fallback output */}
        <div className="relative flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs text-muted-foreground">
          <span>Fallback</span>
          <Handle
            type="source"
            position={Position.Right}
            id={FALLBACK_HANDLE_ID}
          />
        </div>
      </div>
    </div>
  );
};

export default TaskFlowNode;
