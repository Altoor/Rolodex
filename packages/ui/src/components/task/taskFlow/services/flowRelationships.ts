import type { Connection } from "@xyflow/react";
import {
  parseEdgeId,
  parseSourceHandle,
  type SourceHandle,
  type TaskLinkField,
} from "./connection";

type LinkHandle = NonNullable<SourceHandle>;

/** Mutation callbacks that persist one output relationship. */
export interface RelationshipWriter {
  setTaskField(
    taskId: number,
    field: TaskLinkField,
    targetTaskId: number | null,
  ): void;
  setTaskResult(resultId: number, targetTaskId: number | null): void;
  setUserDecisionOption(
    optionId: number,
    resultTaskId: number | null,
  ): void;
  setSwitchTarget(
    taskId: number,
    caseId: string | null,
    targetTaskId: number | null,
  ): void;
}

/** Assigns a target to the output named by `handle`. */
export function setSourceLink(
  sourceTaskId: number,
  handle: LinkHandle,
  targetTaskId: number | null,
  writer: RelationshipWriter,
): void {
  switch (handle.kind) {
    case "switchTarget":
      if (Number.isFinite(sourceTaskId)) {
        writer.setSwitchTarget(sourceTaskId, handle.caseId, targetTaskId);
      }
      return;
    case "taskField":
      if (Number.isFinite(sourceTaskId)) {
        writer.setTaskField(sourceTaskId, handle.field, targetTaskId);
      }
      return;
    case "userDecisionOption":
      writer.setUserDecisionOption(handle.optionId, targetTaskId);
      return;
    case "taskResult":
      writer.setTaskResult(handle.resultId, targetTaskId);
      return;
  }
}

/** Applies a new connection to the relationship named by its source handle. */
export function applyConnectionTarget(
  connection: Connection,
  writer: RelationshipWriter,
): void {
  const targetTaskId = Number(connection.target);
  const sourceHandle = parseSourceHandle(connection.sourceHandle);
  if (!Number.isFinite(targetTaskId) || !sourceHandle) return;

  setSourceLink(Number(connection.source), sourceHandle, targetTaskId, writer);
}

function handlesMatch(oldHandle: LinkHandle, newHandle: LinkHandle): boolean {
  if (oldHandle.kind !== newHandle.kind) return false;

  switch (oldHandle.kind) {
    case "taskField":
      return newHandle.kind === "taskField" && oldHandle.field === newHandle.field;
    case "taskResult":
      return (
        newHandle.kind === "taskResult" &&
        oldHandle.resultId === newHandle.resultId
      );
    case "userDecisionOption":
      return (
        newHandle.kind === "userDecisionOption" &&
        oldHandle.optionId === newHandle.optionId
      );
    case "switchTarget":
      return (
        newHandle.kind === "switchTarget" &&
        oldHandle.caseId === newHandle.caseId
      );
  }
}

/**
 * True when a reconnect only moved the target. Field and switch links also
 * belong to the source task, so changing the source requires clearing the old
 * link.
 */
export function isSameRelationship(
  oldSourceTaskId: number,
  oldHandle: LinkHandle,
  newConnection: Connection,
): boolean {
  const newHandle = parseSourceHandle(newConnection.sourceHandle);
  if (!newHandle || !handlesMatch(oldHandle, newHandle)) return false;

  switch (oldHandle.kind) {
    case "taskField":
    case "switchTarget":
      return oldSourceTaskId === Number(newConnection.source);
    case "taskResult":
    case "userDecisionOption":
      return true;
  }
}

/** Maps an edge id back to the output it represents. */
export function edgeSourceLink(
  edgeId: string,
): { sourceTaskId: number; handle: LinkHandle } | null {
  const parsed = parseEdgeId(edgeId);
  if (!parsed) return null;

  switch (parsed.kind) {
    case "switchTarget":
      return {
        sourceTaskId: parsed.taskId,
        handle: { kind: "switchTarget", caseId: parsed.caseId },
      };
    case "taskField":
      return {
        sourceTaskId: parsed.taskId,
        handle: { kind: "taskField", field: parsed.field },
      };
    case "userDecisionOption":
      return {
        sourceTaskId: 0,
        handle: { kind: "userDecisionOption", optionId: parsed.optionId },
      };
    case "taskResult":
      return {
        sourceTaskId: 0,
        handle: { kind: "taskResult", resultId: parsed.resultId },
      };
  }
}
