import type { Connection, Edge } from "@xyflow/react";
import {
  FALLBACK_HANDLE_ID,
  FALSE_HANDLE_ID,
  TRUE_HANDLE_ID,
} from "../taskFlowTypes";

export type TaskLinkField =
  | "fallbackTaskId"
  | "onTrueTaskId"
  | "onFalseTaskId";

export type SourceHandle =
  | { kind: "taskField"; field: TaskLinkField }
  | { kind: "taskResult"; resultId: number }
  | null;

/** Maps a source handle id to the relationship it represents. */
export function parseSourceHandle(
  sourceHandle: string | null | undefined,
): SourceHandle {
  if (sourceHandle === FALLBACK_HANDLE_ID) {
    return { kind: "taskField", field: "fallbackTaskId" };
  }
  if (sourceHandle === TRUE_HANDLE_ID) {
    return { kind: "taskField", field: "onTrueTaskId" };
  }
  if (sourceHandle === FALSE_HANDLE_ID) {
    return { kind: "taskField", field: "onFalseTaskId" };
  }

  const resultId = Number(sourceHandle);
  if (!Number.isFinite(resultId)) return null;

  return { kind: "taskResult", resultId };
}

export type ParsedEdge =
  | { kind: "taskField"; taskId: number; field: TaskLinkField }
  | { kind: "taskResult"; resultId: number }
  | null;

/** Maps an edge id back to the relationship it represents. */
export function parseEdgeId(edgeId: string): ParsedEdge {
  if (edgeId.startsWith("e-fallback-")) {
    const taskId = Number(edgeId.slice("e-fallback-".length));
    return Number.isFinite(taskId)
      ? { kind: "taskField", taskId, field: "fallbackTaskId" }
      : null;
  }

  if (edgeId.startsWith("e-true-") || edgeId.startsWith("e-false-")) {
    const isTrue = edgeId.startsWith("e-true-");
    const taskId = Number(
      edgeId.slice(isTrue ? "e-true-".length : "e-false-".length),
    );
    return Number.isFinite(taskId)
      ? {
          kind: "taskField",
          taskId,
          field: isTrue ? "onTrueTaskId" : "onFalseTaskId",
        }
      : null;
  }

  if (!edgeId.startsWith("e-")) return null;

  const resultId = Number(edgeId.slice("e-".length));
  return Number.isFinite(resultId) ? { kind: "taskResult", resultId } : null;
}

/** A task can never connect to itself (result or fallback). */
export const isValidConnection = (connection: Connection | Edge) =>
  connection.source !== connection.target;
