import type { FlowTask } from "../taskFlowTypes";

/** Source-handle ids for the `switch` tool. Case handles use a stable id. */
export const SWITCH_CASE_HANDLE_PREFIX = "switch:case:";
export const SWITCH_DEFAULT_HANDLE_ID = "switch:default";

const SWITCH_EDGE_PREFIX = "e-switch-";
const SWITCH_EDGE_DEFAULT = "-default";
const SWITCH_EDGE_CASE = "-case-";

export interface SwitchCaseHandle {
  id: string;
  label: string;
  nextTaskId: number | null;
}

export interface ParsedSwitchConfig {
  cases: SwitchCaseHandle[];
  defaultTaskId: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function switchHandleId(caseId: string): string {
  return `${SWITCH_CASE_HANDLE_PREFIX}${encodeURIComponent(caseId)}`;
}

/** Parses a source handle id into a case id, or null for the Default handle. */
export function parseSwitchHandle(
  sourceHandle: string | null | undefined,
): { caseId: string | null } | null {
  if (!sourceHandle) return null;
  if (sourceHandle === SWITCH_DEFAULT_HANDLE_ID) return { caseId: null };

  if (!sourceHandle.startsWith(SWITCH_CASE_HANDLE_PREFIX)) return null;

  const encoded = sourceHandle.slice(SWITCH_CASE_HANDLE_PREFIX.length);
  if (!encoded) return null;

  try {
    return { caseId: decodeURIComponent(encoded) };
  } catch {
    return null;
  }
}

export function parseSwitchConfig(value: unknown): ParsedSwitchConfig {
  if (!isRecord(value)) return { cases: [], defaultTaskId: null };

  const cases = Array.isArray(value.cases)
    ? value.cases.flatMap((entry): SwitchCaseHandle[] => {
        if (!isRecord(entry)) return [];
        if (typeof entry.id !== "string" || !entry.id.trim()) return [];

        return [
          {
            id: entry.id,
            label:
              typeof entry.label === "string" && entry.label.trim()
                ? entry.label
                : entry.id,
            nextTaskId:
              typeof entry.nextTaskId === "number" &&
              Number.isInteger(entry.nextTaskId)
                ? entry.nextTaskId
                : null,
          },
        ];
      })
    : [];

  return {
    cases,
    defaultTaskId:
      typeof value.defaultTaskId === "number" &&
      Number.isInteger(value.defaultTaskId)
        ? value.defaultTaskId
        : null,
  };
}

/**
 * Returns a copy of a switch toolConfig with one output rewired. A null
 * `caseId` updates the Default target.
 */
export function setSwitchTarget(
  config: unknown,
  caseId: string | null,
  taskId: number | null,
): Record<string, unknown> {
  const record = isRecord(config) ? config : {};

  if (caseId === null) {
    return { ...record, defaultTaskId: taskId };
  }

  const cases = Array.isArray(record.cases) ? record.cases : [];

  return {
    ...record,
    cases: cases.map((entry) =>
      isRecord(entry) && entry.id === caseId
        ? { ...entry, nextTaskId: taskId }
        : entry,
    ),
  };
}

/** Targets followed by the flow layout: every case plus the default. */
export function switchTargetTaskIds(task: FlowTask): number[] {
  const config = parseSwitchConfig(task.toolConfig);
  const ids = config.cases.flatMap((entry) =>
    entry.nextTaskId != null ? [entry.nextTaskId] : [],
  );

  if (config.defaultTaskId != null) ids.push(config.defaultTaskId);
  return ids;
}

/** Stable edge id for a switch output. Null `caseId` means Default. */
export function switchEdgeId(taskId: number, caseId: string | null): string {
  return caseId === null
    ? `${SWITCH_EDGE_PREFIX}${taskId}${SWITCH_EDGE_DEFAULT}`
    : `${SWITCH_EDGE_PREFIX}${taskId}${SWITCH_EDGE_CASE}${encodeURIComponent(caseId)}`;
}

export function parseSwitchEdgeId(
  edgeId: string,
): { taskId: number; caseId: string | null } | null {
  if (!edgeId.startsWith(SWITCH_EDGE_PREFIX)) return null;

  const rest = edgeId.slice(SWITCH_EDGE_PREFIX.length);
  const caseIndex = rest.indexOf(SWITCH_EDGE_CASE);

  if (caseIndex > 0) {
    const taskId = Number(rest.slice(0, caseIndex));
    const encoded = rest.slice(caseIndex + SWITCH_EDGE_CASE.length);
    if (!Number.isFinite(taskId) || !encoded) return null;

    try {
      return { taskId, caseId: decodeURIComponent(encoded) };
    } catch {
      return null;
    }
  }

  if (rest.endsWith(SWITCH_EDGE_DEFAULT)) {
    const taskId = Number(rest.slice(0, -SWITCH_EDGE_DEFAULT.length));
    return Number.isFinite(taskId) ? { taskId, caseId: null } : null;
  }

  return null;
}
