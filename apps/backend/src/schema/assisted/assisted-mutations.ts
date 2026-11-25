import { GraphQLError } from "graphql";
import { requireUserId } from "../auth";
import { builder } from "../builder";
import { AssistedRun } from "./assisted-types";
import { loadRunRow } from "./assisted-access";
import {
  acceptAttempt,
  overrideDecision,
} from "../../assisted/application/accept-attempt";
import { applyStepRevision } from "../../assisted/application/apply-revision";
import {
  addDecisionOption,
  editDecisionWording,
  optimizeDecision,
} from "../../assisted/application/optimize-decision";
import {
  cancelAssistedRun,
  deleteAssistedRun,
} from "../../assisted/application/cancel-run";
import { proposeStepRevision } from "../../assisted/application/propose-revision";
import { draftDecisionTargetTask } from "../../assisted/application/next-task-draft";
import {
  createDecisionTargetTask,
  wireDecisionTargetTask,
} from "../../assisted/application/wire-decision-target";
import { startAssistedRun } from "../../assisted/application/start-run";
import { saveUserDecisionOptions } from "../../assisted/application/user-decision-options";

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
