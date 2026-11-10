import type { Node } from "@xyflow/react";
import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";

type QueryTask = NonNullable<GetTasksQuery["tasks"]>[number];

/** A task from the TASKS query with a non-null id. */
export type FlowTask = QueryTask & { id: number };

/** A single TaskResult, rendered as an output handle on a node. */
export type FlowTaskResult = NonNullable<FlowTask["taskResults"]>[number];

/** Handle id used for a task's fallback output on the flow node. */
export const FALLBACK_HANDLE_ID = "fallback";
/** Handle ids used for the `if` tool's conditional outputs. */
export const TRUE_HANDLE_ID = "true";
export const FALSE_HANDLE_ID = "false";

export type TaskFlowNodeData = {
  taskId: number;
  name: string;
  type: string | null;
  decisionType: string | null;
  toolKey: string | null;
  model: string | null;
  decisionModel: string | null;
  onTrueTaskId: number | null;
  onFalseTaskId: number | null;
  taskResults: FlowTaskResult[];
  onTaskDelete?: (taskId: number) => void;
} & Record<string, unknown>;

export type TaskFlowNode = Node<TaskFlowNodeData, "taskFlow">;
