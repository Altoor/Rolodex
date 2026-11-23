import { asc, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { db, queuedTasks, tasks } from "@repo/db";
import { publish } from "../../queue/step-store";
import type { QueuedRow } from "../../queue/types";
import { createQueuedTask } from "../task/queuedtask/queued-task-service";
import {
  createFlowPlan,
  planFlowRun,
  type FlowPlanDraft,
} from "./flow-plan-service";

export type FlowRunReviewStatus =
  "running" | "awaiting_review" | "accepted" | "revised";

export interface FlowRunReviewStep {
  queuedTaskId: number;
  taskId: number;
  taskName: string | null;
  status: string;
  depth: number;
  note: string | null;
}

export interface FlowRunReviewContext {
  runId: string;
  goal: string | null;
  status: FlowRunReviewStatus;
  outcome: "completed" | "failed" | null;
  canReview: boolean;
  steps: FlowRunReviewStep[];
  review: Record<string, unknown> | null;
}

export interface FlowRunReviewResult {
  runId: string;
  status: FlowRunReviewStatus;
  accepted: boolean;
  /** The new run started from the user's feedback, when revised. */
  revisionRunId: string | null;
  queuedTask: QueuedRow | null;
}

const ACTIVE_STATUSES = new Set(["queued", "running", "awaiting_input"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function noteOf(result: unknown): string | null {
  const record = asRecord(result);
  return asString(record?.note) ?? asString(record?.error);
}

function attachmentsText(toolState: unknown): string | null {
  const entries = Array.isArray(toolState) ? toolState : [];
  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record) continue;

    const lines = [
      ...(Array.isArray(record.files) ? record.files : []),
      ...(Array.isArray(record.folders) ? record.folders : []),
    ].flatMap((item) => {
      const ref = asRecord(item);
      const name = asString(ref?.name);
      const kind = asString(ref?.kind);
      return name ? [`${kind ?? "file"}: ${name}`] : [];
    });

    if (lines.length > 0) return lines.join("\n");
  }
  return null;
}

function toolStateRecords(toolState: unknown): Record<string, unknown>[] {
  const entries = Array.isArray(toolState) ? toolState : [];
  return entries.flatMap((entry) => {
    const record = asRecord(entry);
    return record ? [record] : [];
  });
}

async function loadRunRoot(userId: number, runId: string): Promise<QueuedRow> {
  const root = await db.query.queuedTasks.findFirst({
    where: { runId, depth: 0 },
  });

  if (!root || root.queued_by !== userId) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (!root.autoPlanned) {
    throw new GraphQLError(
      "This run was not planned automatically, so it has no run review",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  return root;
}

async function loadRunRows(runId: string): Promise<QueuedRow[]> {
  return db
    .select()
    .from(queuedTasks)
    .where(eq(queuedTasks.runId, runId))
    .orderBy(asc(queuedTasks.depth), asc(queuedTasks.id));
}

function buildContext(
  runId: string,
  root: QueuedRow,
  rows: QueuedRow[],
  taskNames: Map<number, string>,
): FlowRunReviewContext {
  const active = rows.some((row) => ACTIVE_STATUSES.has(row.status));
  const failed = rows.some((row) => row.status === "failed");
  const review = asRecord(root.runReview);

  let status: FlowRunReviewStatus;
  if (active) status = "running";
  else if (review?.status === "accepted") status = "accepted";
  else if (review?.status === "revised") status = "revised";
  else status = "awaiting_review";

  return {
    runId,
    goal: root.flowGoal ?? null,
    status,
    outcome: active ? null : failed ? "failed" : "completed",
    canReview: status === "awaiting_review",
    steps: rows.map((row) => ({
      queuedTaskId: row.id,
      taskId: row.taskId,
      taskName: taskNames.get(row.taskId) ?? null,
      status: row.status,
      depth: row.depth,
      note: noteOf(row.result),
    })),
    review,
  };
}

async function loadTaskNames(rows: QueuedRow[]): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map((row) => row.taskId))];
  if (ids.length === 0) return new Map();

  const found = await db.select({ id: tasks.id, name: tasks.name }).from(tasks);
  const byId = new Map(found.map((task) => [task.id, task.name]));
  return new Map(
    ids.flatMap((id) => {
      const name = byId.get(id);
      return name ? [[id, name] as const] : [];
    }),
  );
}

/** Loads the review state of an auto-planned run. */
export async function getFlowRunReview(
  userId: number,
  runId: string,
): Promise<FlowRunReviewContext> {
  const root = await loadRunRoot(userId, runId);
  const rows = await loadRunRows(runId);
  const taskNames = await loadTaskNames(rows);
  return buildContext(runId, root, rows, taskNames);
}

function runSummary(context: FlowRunReviewContext, root: QueuedRow): string {
  const lines = [
    `Goal: ${root.flowGoal ?? context.goal ?? "unknown"}`,
    `Outcome: ${context.outcome ?? "unfinished"}`,
    "Steps:",
    ...context.steps.map((step) => {
      const note = step.note ? ` — ${step.note}` : "";
      return `- ${step.taskName ?? `task ${step.taskId}`} [${step.status}]${note}`;
    }),
  ];

  return lines.join("\n");
}

async function reviseRun(
  userId: number,
  root: QueuedRow,
  context: FlowRunReviewContext,
  feedback: string,
): Promise<{ plan: FlowPlanDraft; queuedTask: QueuedRow | null }> {
  const plan = await planFlowRun(
    userId,
    root.state,
    feedback,
    null,
    null,
    {
      previousRun: runSummary(context, root),
      feedback,
      attachmentsText: attachmentsText(root.toolState),
    },
    root.taskId,
  );

  const created = await createFlowPlan(userId, plan);
  const queuedTask = await createQueuedTask(userId, {
    taskId: created.startTaskId,
    state: root.state,
    toolState: toolStateRecords(root.toolState),
    autoPlanned: true,
    flowGoal: plan.goal,
  });

  return { plan, queuedTask: queuedTask ?? null };
}

/**
 * Reviews a finished auto-planned run. Accepting marks the run reviewed;
 * sending feedback re-plans the whole flow and starts a new run with the same
 * original state and attachments.
 */
export async function reviewFlowRun(
  userId: number,
  runId: string,
  accepted: boolean,
  feedback: string | null,
): Promise<FlowRunReviewResult> {
  const root = await loadRunRoot(userId, runId);
  const rows = await loadRunRows(runId);
  const taskNames = await loadTaskNames(rows);
  const context = buildContext(runId, root, rows, taskNames);

  if (context.status === "running") {
    throw new GraphQLError("This run has not finished yet", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (context.status !== "awaiting_review") {
    throw new GraphQLError("This run has already been reviewed", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const now = new Date();

  if (accepted) {
    const review = {
      status: "accepted",
      reviewedAt: now.toISOString(),
      reviewedBy: userId,
    };
    const [updated] = await db
      .update(queuedTasks)
      .set({ runReview: review })
      .where(eq(queuedTasks.id, root.id))
      .returning();

    if (updated) publish(updated, "run accepted");

    return {
      runId,
      status: "accepted",
      accepted: true,
      revisionRunId: null,
      queuedTask: updated ?? null,
    };
  }

  const text = (feedback ?? "").trim();
  if (!text) {
    throw new GraphQLError("Describe what should change", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const { queuedTask } = await reviseRun(userId, root, context, text);
  const review = {
    status: "revised",
    feedback: text,
    revisionRunId: queuedTask?.runId ?? null,
    reviewedAt: now.toISOString(),
    reviewedBy: userId,
  };

  const [updated] = await db
    .update(queuedTasks)
    .set({ runReview: review })
    .where(eq(queuedTasks.id, root.id))
    .returning();

  if (updated) publish(updated, "run revised");

  return {
    runId,
    status: "revised",
    accepted: false,
    revisionRunId: queuedTask?.runId ?? null,
    queuedTask: queuedTask ?? null,
  };
}
