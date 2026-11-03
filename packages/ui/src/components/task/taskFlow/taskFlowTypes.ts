import type { Node } from "@xyflow/react";
import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";

type QueryTask = NonNullable<GetTasksQuery["tasks"]>[number];

/** A task from the TASKS query with a non-null id. */
export type FlowTask = QueryTask & { id: number };

/** A single TaskResult, rendered as an output handle on a node. */
export type FlowTaskResult = NonNullable<FlowTask["taskResults"]>[number];

export type TaskFlowNodeData = {
  taskId: number;
  name: string;
  type: string | null;
  decisionType: string | null;
  taskResults: FlowTaskResult[];
  onTaskDelete?: (taskId: number) => void;
} & Record<string, unknown>;

export type TaskFlowNode = Node<TaskFlowNodeData, "taskFlow">;
