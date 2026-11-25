import { desc, eq } from "drizzle-orm";
import { db, stepAttempts } from "@repo/db";
import type { queuedTasks, runs, traceEvents } from "@repo/db";
import { builder } from "../builder";
import { QueuedTaskStatus } from "../task/queuedtask/queued-task";
import { Task } from "../task/task/task";

export type RunRow = typeof runs.$inferSelect;
export type StepRow = typeof queuedTasks.$inferSelect;
export type AttemptRow = typeof stepAttempts.$inferSelect;
export type TraceRow = typeof traceEvents.$inferSelect;

export const AssistedRunStatus = builder.enumType("AssistedRunStatus", {
  values: [
    "running",
    "awaiting_step_review",
    "awaiting_decision_review",
    "awaiting_user_choice",
    "completed",
    "cancelled",
    "failed",
  ],
});

export const AttemptKind = builder.enumType("AttemptKind", {
  values: ["initial", "revision", "replay"],
});

export const AttemptStatus = builder.enumType("AttemptStatus", {
  values: ["running", "succeeded", "failed", "cancelled", "committed"],
});

export const StepAttempt = builder
  .objectRef<AttemptRow>("StepAttempt")
  .implement({
    fields: (t) => ({
      id: t.exposeInt("id"),
      queuedTaskId: t.exposeInt("queuedTaskId"),
      attemptNumber: t.exposeInt("attemptNumber"),
      kind: t.field({
        type: AttemptKind,
        resolve: (parent) => parent.kind,
      }),
      status: t.field({
        type: AttemptStatus,
        resolve: (parent) => parent.status,
      }),
      taskSnapshot: t.field({
        type: "JSON",
        resolve: (parent) => parent.taskSnapshot ?? null,
      }),
      beforeState: t.exposeString("beforeState"),
      beforeToolState: t.field({
        type: "JSON",
        resolve: (parent) => parent.beforeToolState ?? [],
      }),
      afterState: t.exposeString("afterState", { nullable: true }),
      afterToolState: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.afterToolState ?? null,
      }),
      result: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.result ?? null,
      }),
      effectJournal: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.effectJournal ?? null,
      }),
      revision: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.revision ?? null,
      }),
      review: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.review ?? null,
      }),
      workspaceKey: t.exposeString("workspaceKey", { nullable: true }),
      createdAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.createdAt,
      }),
      finishedAt: t.field({
        type: "DateTime",
        nullable: true,
        resolve: (parent) => parent.finishedAt,
      }),
      committedAt: t.field({
        type: "DateTime",
        nullable: true,
        resolve: (parent) => parent.committedAt,
      }),
    }),
  });

export const AssistedStep = builder
  .objectRef<StepRow>("AssistedStep")
  .implement({
    fields: (t) => ({
      id: t.exposeInt("id"),
      taskId: t.exposeInt("taskId"),
      depth: t.exposeInt("depth"),
      status: t.field({
        type: QueuedTaskStatus,
        resolve: (parent) => parent.status,
      }),
      state: t.exposeString("state"),
      toolState: t.field({
        type: "JSON",
        resolve: (parent) => parent.toolState ?? [],
      }),
      result: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.result ?? null,
      }),
      pendingChoice: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.pendingChoice ?? null,
      }),
      task: t.field({
        type: Task,
        nullable: true,
        resolve: (parent) =>
          db.query.tasks.findFirst({ where: { id: parent.taskId } }),
      }),
      attempts: t.field({
        type: [StepAttempt],
        resolve: (parent) =>
          db.query.stepAttempts.findMany({
            where: { queuedTaskId: parent.id },
          }),
      }),
      currentAttempt: t.field({
        type: StepAttempt,
        nullable: true,
        resolve: async (parent) => {
          const [attempt] = await db
            .select()
            .from(stepAttempts)
            .where(eq(stepAttempts.queuedTaskId, parent.id))
            .orderBy(desc(stepAttempts.attemptNumber))
            .limit(1);
          return attempt ?? null;
        },
      }),
    }),
  });

export const AssistedTraceEvent = builder
  .objectRef<TraceRow>("AssistedTraceEvent")
  .implement({
    fields: (t) => ({
      id: t.exposeInt("id"),
      runId: t.exposeString("runId"),
      attemptId: t.exposeInt("attemptId", { nullable: true }),
      sequence: t.exposeInt("sequence"),
      kind: t.exposeString("kind"),
      payload: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.payload ?? null,
      }),
      createdAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.createdAt,
      }),
    }),
  });

export const AssistedRun = builder
  .objectRef<RunRow>("AssistedRun")
  .implement({
    fields: (t) => ({
      id: t.exposeString("id"),
      status: t.field({
        type: AssistedRunStatus,
        resolve: (parent) => parent.status,
      }),
      mode: t.exposeString("mode"),
      state: t.exposeString("state"),
      startTaskId: t.exposeInt("startTaskId", { nullable: true }),
      startTaskSnapshot: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.startTaskSnapshot ?? null,
      }),
      createdAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.createdAt,
      }),
      updatedAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.updatedAt,
      }),
      steps: t.field({
        type: [AssistedStep],
        resolve: (parent) =>
          db.query.queuedTasks.findMany({ where: { runId: parent.id } }),
      }),
      attempts: t.field({
        type: [StepAttempt],
        resolve: (parent) =>
          db.query.stepAttempts.findMany({ where: { runId: parent.id } }),
      }),
    }),
  });

