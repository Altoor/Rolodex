import { asc, eq } from "drizzle-orm";
import { db, queuedTasks, runs, tasks } from "@repo/db";
import type {
  ApiEndpointRow,
  ApiRequestRow,
  FlowSnapshot,
  FlowStatus,
  FlowStepSnapshot,
} from "../domain/types";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function readOutput(
  record: Record<string, unknown> | null,
): unknown {
  return record && "output" in record ? record.output : null;
}

function flowStatus(
  runStatus: string,
  steps: FlowStepSnapshot[],
): FlowStatus {
  if (TERMINAL_RUN_STATUSES.has(runStatus)) {
    return runStatus as FlowStatus;
  }
  if (steps.some((step) => step.status === "awaiting_input")) {
    return "awaiting_input";
  }
  return "running";
}

/** Loads the public status view for one API request. */
export async function getFlowSnapshot(
  endpoint: ApiEndpointRow,
  request: ApiRequestRow,
): Promise<FlowSnapshot | null> {
  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.id, request.runId))
    .limit(1);

  if (!run) return null;

  const rows = await db
    .select({
      step: queuedTasks,
      taskName: tasks.name,
      toolKey: tasks.toolKey,
    })
    .from(queuedTasks)
    .leftJoin(tasks, eq(queuedTasks.taskId, tasks.id))
    .where(eq(queuedTasks.runId, run.id))
    .orderBy(asc(queuedTasks.queued_at), asc(queuedTasks.id));

  const steps: FlowStepSnapshot[] = rows.map((row) => {
    const result = asRecord(row.step.result);
    return {
      id: row.step.id,
      taskId: row.step.taskId,
      taskName: row.taskName ?? "Unknown task",
      toolKey: row.toolKey ?? null,
      status: row.step.status,
      summary: readString(result, "summary"),
      note: readString(result, "note"),
      queuedAt: row.step.queued_at.toISOString(),
      forkIndex: row.step.forkIndex ?? null,
      isJoin: row.step.isJoin,
    };
  });

  const status = flowStatus(run.status, steps);
  const completedEndFlows = rows.filter((row) => {
    const result = asRecord(row.step.result);
    return (
      row.step.status === "completed" &&
      (row.toolKey === "end_flow" || result?.endFlow === true)
    );
  });
  // Prefer an end_flow after the fan-in. A branch-local end_flow is only a
  // fallback for flows that never leave their foreach region.
  const endFlow =
    completedEndFlows.filter((row) => row.step.forkGroupId == null).at(-1) ??
    completedEndFlows.at(-1);
  const failed = rows.find((row) => row.step.status === "failed");
  const failedResult = asRecord(failed?.step.result ?? null);

  return {
    requestId: request.id,
    runId: run.id,
    status,
    endpoint: {
      id: endpoint.id,
      name: endpoint.name,
      slug: endpoint.slug,
    },
    submittedAt: request.createdAt.toISOString(),
    finishedAt: TERMINAL_RUN_STATUSES.has(run.status)
      ? run.updatedAt.toISOString()
      : null,
    result: endFlow ? readOutput(asRecord(endFlow.step.result)) : null,
    error: failed
      ? readString(failedResult, "note") ?? "The flow failed"
      : null,
    steps,
  };
}
