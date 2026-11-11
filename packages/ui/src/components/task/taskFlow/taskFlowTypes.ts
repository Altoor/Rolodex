import type { Edge, Node, XYPosition } from "@xyflow/react";
import type { GetTasksQuery } from "@repo/queries/__generated__/graphql";

type QueryTask = NonNullable<GetTasksQuery["tasks"]>[number];

/** A task from the TASKS query with a non-null id. */
export type FlowTask = QueryTask & { id: number };

/** A single TaskResult, rendered as an output handle on a node. */
export type FlowTaskResult = NonNullable<FlowTask["taskResults"]>[number];

/** A single userDecision option, rendered as an output handle on a node. */
export type FlowUserDecisionOption = NonNullable<
  FlowTask["userDecisionOptions"]
>[number];

/** Handle id used for a task's fallback output on the flow node. */
export const FALLBACK_HANDLE_ID = "fallback";
/** Handle ids used for the `if` tool's conditional outputs. */
export const TRUE_HANDLE_ID = "true";
export const FALSE_HANDLE_ID = "false";
/** Prefix for userDecision option handles, e.g. `udo:12`. */
export const USER_DECISION_HANDLE_PREFIX = "udo:";

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
  forceUserDecideIfNoMatch: boolean;
  userDecisionType: string | null;
  userDecisionConfig: unknown;
  userDecisionOptions: FlowUserDecisionOption[];
  onTaskDelete?: (taskId: number) => void;
} & Record<string, unknown>;

export type TaskFlowNode = Node<TaskFlowNodeData, "taskFlow">;

/** Menu opened by right-clicking an edge or empty canvas space. */
export type FlowContextMenu =
  | { kind: "edge"; x: number; y: number; edge: Edge }
  | { kind: "pane"; x: number; y: number; position: XYPosition };

export interface TaskFlowProps {
  selectedTaskId?: number;
  onSelectTaskId?: (id: number | undefined) => void;
  defaultTaskId?: number | null;
  onDefaultTaskChange?: (id: number) => void;
}
