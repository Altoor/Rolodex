import { Handle, Position } from "@xyflow/react";
import {
  FALLBACK_HANDLE_ID,
  FALSE_HANDLE_ID,
  TRUE_HANDLE_ID,
  type TaskFlowNodeData,
} from "../taskFlowTypes";
import { resultLabel } from "../services/result-label";

interface TaskFlowNodeHandlesProps {
  data: TaskFlowNodeData;
}

const TaskFlowNodeHandles = ({ data }: TaskFlowNodeHandlesProps) => (
  <div className="mt-2 flex flex-col gap-1">
    {data.type === "tool" ? (
      data.toolKey === "if" ? (
        <>
          <div className="relative flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs text-muted-foreground">
            <span>True</span>
            <Handle
              type="source"
              position={Position.Right}
              id={TRUE_HANDLE_ID}
            />
          </div>
          <div className="relative flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs text-muted-foreground">
            <span>False</span>
            <Handle
              type="source"
              position={Position.Right}
              id={FALSE_HANDLE_ID}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground/60">
          Chains through the next/fallback edge.
        </p>
      )
    ) : data.taskResults.length > 0 ? (
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

    {/* Every task also has a fallback output, except the if tool which uses
        its true/false handles instead. */}
    {data.toolKey === "if" ? null : (
      <div className="relative flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs text-muted-foreground">
        <span>{data.type === "tool" ? "Next / fallback" : "Fallback"}</span>
        <Handle
          type="source"
          position={Position.Right}
          id={FALLBACK_HANDLE_ID}
        />
      </div>
    )}
  </div>
);

export default TaskFlowNodeHandles;
