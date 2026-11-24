import { GraphQLError } from "graphql";
import { and, desc, eq, or } from "drizzle-orm";
import {
  db,
  queuedTasks,
  runs,
  stepAttempts,
  traceEvents,
} from "@repo/db";
import { builder } from "../builder";
import { requireUserId } from "../auth";
import { QueuedTaskStatus } from "../task/queuedtask/queued-task";
import { Task } from "../task/task/task";
import {
  acceptAttempt,
  overrideDecision,
} from "../../assisted/application/accept-attempt";
import {
  applyStepRevision,
} from "../../assisted/application/apply-revision";
import {
  addDecisionOption,
  editDecisionWording,
  optimizeDecision,
} from "../../assisted/application/optimize-decision";
import { cancelAssistedRun, deleteAssistedRun } from "../../assisted/application/cancel-run";
import { proposeStepRevision } from "../../assisted/application/propose-revision";
import { draftDecisionTargetTask } from "../../assisted/application/next-task-draft";
import {
  createDecisionTargetTask,
  wireDecisionTargetTask,
} from "../../assisted/application/wire-decision-target";
import { startAssistedRun } from "../../assisted/application/start-run";
import { saveUserDecisionOptions } from "../../assisted/application/user-decision-options";
import { assistedEvents } from "../../assisted/infrastructure/trace";

type RunRow = typeof runs.$inferSelect;
type StepRow = typeof queuedTasks.$inferSelect;
type AttemptRow = typeof stepAttempts.$inferSelect;
type TraceRow = typeof traceEvents.$inferSelect;

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

async function requireOwnedRun(userId: number, runId: string) {
  const run = await db.query.runs.findFirst({ where: { id: runId } });
  if (!run || run.userId !== userId) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return run;
}

export async function loadRunRow(runId: string): Promise<RunRow> {
  const run = await db.query.runs.findFirst({ where: { id: runId } });
  if (!run) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return run;
}

builder.queryType({
  fields: (t) => ({
    assistedRun: t.field({
      type: AssistedRun,
      nullable: true,
      args: { runId: t.arg.string({ required: true }) },
      resolve: async (_root, { runId }, ctx) => {
        const userId = requireUserId(ctx);
        await requireOwnedRun(userId, runId);
        return loadRunRow(runId);
      },
    }),

    activeAssistedRuns: t.field({
      type: [AssistedRun],
      resolve: async (_root, _args, ctx) => {
        const userId = requireUserId(ctx);
        return db
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.userId, userId),
              eq(runs.mode, "assisted"),
              or(
                eq(runs.status, "running"),
                eq(runs.status, "awaiting_step_review"),
                eq(runs.status, "awaiting_decision_review"),
                eq(runs.status, "awaiting_user_choice"),
              ),
            ),
          )
          .orderBy(desc(runs.createdAt));
      },
    }),

    assistedRunHistory: t.field({
      type: [AssistedRun],
      args: {
        limit: t.arg.int({ defaultValue: 20 }),
        offset: t.arg.int({ defaultValue: 0 }),
      },
      resolve: async (_root, { limit, offset }, ctx) => {
        const userId = requireUserId(ctx);
        return db
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.userId, userId),
              eq(runs.mode, "assisted"),
              or(
                eq(runs.status, "completed"),
                eq(runs.status, "cancelled"),
                eq(runs.status, "failed"),
              ),
            ),
          )
          .orderBy(desc(runs.createdAt))
          .limit(Math.min(Math.max(limit ?? 20, 1), 100))
          .offset(Math.max(offset ?? 0, 0));
      },
    }),

    attemptTrace: t.field({
      type: [AssistedTraceEvent],
      args: { attemptId: t.arg.int({ required: true }) },
      resolve: async (_root, { attemptId }, ctx) => {
        const userId = requireUserId(ctx);
        const attempt = await db.query.stepAttempts.findFirst({
          where: { id: attemptId },
        });
        if (!attempt) {
          throw new GraphQLError("Attempt not found", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
        await requireOwnedRun(userId, attempt.runId);
        return db
          .select()
          .from(traceEvents)
          .where(eq(traceEvents.attemptId, attemptId))
          .orderBy(traceEvents.sequence);
      },
    }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    startAssistedRun: t.field({
      type: AssistedRun,
      args: { input: t.arg({ type: "JSON", required: true }) },
      resolve: async (_root, { input }, ctx) => {
        const userId = requireUserId(ctx);
        const run = await startAssistedRun(
          userId,
          input as Parameters<typeof startAssistedRun>[1],
        );
        return loadRunRow(run.id);
      },
    }),

    acceptStepAttempt: t.field({
      type: AssistedRun,
      args: { attemptId: t.arg.int({ required: true }) },
      resolve: async (_root, { attemptId }, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await acceptAttempt(userId, attemptId);
        return loadRunRow(runId);
      },
    }),

    requestStepRevision: t.field({
      type: "JSON",
      args: {
        attemptId: t.arg.int({ required: true }),
        feedback: t.arg.string({ required: true }),
      },
      resolve: async (_root, { attemptId, feedback }, ctx) => {
        const userId = requireUserId(ctx);
        return proposeStepRevision(userId, attemptId, feedback);
      },
    }),

    applyStepRevision: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        proposal: t.arg({ type: "JSON", required: true }),
      },
      resolve: async (_root, { attemptId, proposal }, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await applyStepRevision(userId, attemptId, proposal);
        return loadRunRow(runId);
      },
    }),

    reviewDecision: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        accept: t.arg.boolean({ required: true }),
      },
      resolve: async (_root, { attemptId, accept }, ctx) => {
        const userId = requireUserId(ctx);
        if (!accept) {
          throw new GraphQLError(
            "Choose another option or add a new one instead",
            { extensions: { code: "BAD_USER_INPUT" } },
          );
        }
        const runId = await acceptAttempt(userId, attemptId);
        return loadRunRow(runId);
      },
    }),

    overrideDecision: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        resultId: t.arg.int({ required: true }),
      },
      resolve: async (_root, { attemptId, resultId }, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await overrideDecision(userId, attemptId, resultId);
        return loadRunRow(runId);
      },
    }),

    optimizeDecision: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        expectedResultId: t.arg.int({ required: true }),
        feedback: t.arg.string(),
      },
      resolve: async (_root, { attemptId, expectedResultId, feedback }, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await optimizeDecision(
          userId,
          attemptId,
          expectedResultId,
          feedback ?? undefined,
        );
        return loadRunRow(runId);
      },
    }),

    editDecisionWording: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        decisionPremise: t.arg.string({ required: true }),
        instruction: t.arg.string({ required: true }),
        optionDescriptions: t.arg({ type: ["String"] }),
      },
      resolve: async (_root, args, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await editDecisionWording(userId, args.attemptId, {
          decisionPremise: args.decisionPremise,
          instruction: args.instruction,
          optionDescriptions: args.optionDescriptions ?? null,
        });
        return loadRunRow(runId);
      },
    }),

    addDecisionOption: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        label: t.arg.string({ required: true }),
        description: t.arg.string(),
        value: t.arg.string(),
        targetTaskId: t.arg.int(),
      },
      resolve: async (_root, args, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await addDecisionOption(userId, args.attemptId, {
          label: args.label,
          description: args.description,
          value: args.value,
          targetTaskId: args.targetTaskId,
        });
        return loadRunRow(runId);
      },
    }),

    draftDecisionTargetTask: t.field({
      type: "JSON",
      args: {
        attemptId: t.arg.int({ required: true }),
        feedback: t.arg.string(),
        draft: t.arg({ type: "JSON" }),
      },
      resolve: async (_root, { attemptId, feedback, draft }, ctx) => {
        const userId = requireUserId(ctx);
        return draftDecisionTargetTask(userId, attemptId, feedback ?? undefined, draft);
      },
    }),

    wireDecisionTargetTask: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        resultId: t.arg.int({ required: true }),
        targetTaskId: t.arg.int({ required: true }),
      },
      resolve: async (_root, args, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await wireDecisionTargetTask(
          userId,
          args.attemptId,
          args.resultId,
          args.targetTaskId,
        );
        return loadRunRow(runId);
      },
    }),

    createDecisionTargetTask: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        resultId: t.arg.int({ required: true }),
        draft: t.arg({ type: "JSON", required: true }),
      },
      resolve: async (_root, args, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await createDecisionTargetTask(
          userId,
          args.attemptId,
          args.resultId,
          args.draft,
        );
        return loadRunRow(runId);
      },
    }),

    cancelAssistedRun: t.field({
      type: "Boolean",
      args: { runId: t.arg.string({ required: true }) },
      resolve: async (_root, { runId }, ctx) => {
        const userId = requireUserId(ctx);
        return cancelAssistedRun(userId, runId);
      },
    }),

    deleteAssistedRun: t.field({
      type: "Boolean",
      args: { runId: t.arg.string({ required: true }) },
      resolve: async (_root, { runId }, ctx) => {
        const userId = requireUserId(ctx);
        return deleteAssistedRun(userId, runId);
      },
    }),

    saveUserDecisionOptions: t.field({
      type: AssistedRun,
      args: {
        attemptId: t.arg.int({ required: true }),
        options: t.arg({ type: "JSON", required: true }),
      },
      resolve: async (_root, { attemptId, options }, ctx) => {
        const userId = requireUserId(ctx);
        const runId = await saveUserDecisionOptions(userId, attemptId, options);
        return loadRunRow(runId);
      },
    }),
  }),
});

builder.subscriptionType({
  fields: (t) => ({
    assistedTraceEvent: t.field({
      type: AssistedTraceEvent,
      args: { runId: t.arg.string({ required: true }) },
      subscribe: async function* (_root, { runId }, ctx) {
        const userId = requireUserId(ctx);
        await requireOwnedRun(userId, runId);

        for (;;) {
          const event = await new Promise<{ runId: string; event: TraceRow }>(
            (resolve) => assistedEvents.once("trace", resolve),
          );
          if (event.runId !== runId) continue;
          yield event.event;
        }
      },
      resolve: (event) => event,
    }),
  }),
});


