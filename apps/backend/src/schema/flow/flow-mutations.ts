import { builder } from "../builder";
import { requireUserId } from "../auth";
import { QueuedTask } from "../task/queuedtask/queued-task";
import {
  FlowPlanStartResult,
  FlowRunReviewResult,
  FlowStartKind,
  FlowStartProposal,
  FlowStartResult,
  FlowTaskDraft,
} from "./flow";
import {
  proposeFlowStart,
  type FlowStartKind as FlowStartKindValue,
} from "./flow-proposal-service";
import { draftFlowStartTask, refineFlowTaskDraft } from "./flow-draft-service";
import { confirmFlowStartDraft } from "./flow-start-service";
import { wireDecisionResultTarget } from "./flow-decision-target-service";
import { planAndStartFlow } from "./flow-plan-service";
import { reviewFlowRun } from "./flow-run-review-service";
import { confirmNextStep } from "../../queue/confirm-next-step";

builder.mutationType({
  fields: (t) => ({
    planAndStartFlow: t.field({
      type: FlowPlanStartResult,
      args: {
        state: t.arg.string({ required: true }),
        prompt: t.arg.string(),
        fileIds: t.arg.intList(),
        folderIds: t.arg.intList(),
        startTaskId: t.arg.int(),
      },
      resolve: async (
        _root,
        { state, prompt, fileIds, folderIds, startTaskId },
        ctx,
      ) => {
        const userId = requireUserId(ctx);
        return planAndStartFlow(
          userId,
          state,
          prompt ?? null,
          fileIds,
          folderIds,
          startTaskId ?? null,
        );
      },
    }),

    reviewFlowRun: t.field({
      type: FlowRunReviewResult,
      args: {
        runId: t.arg.string({ required: true }),
        accepted: t.arg.boolean({ required: true }),
        feedback: t.arg.string(),
      },
      resolve: async (_root, { runId, accepted, feedback }, ctx) => {
        const userId = requireUserId(ctx);
        return reviewFlowRun(userId, runId, accepted, feedback ?? null);
      },
    }),

    proposeFlowStart: t.field({
      type: FlowStartProposal,
      args: {
        state: t.arg.string({ required: true }),
        prompt: t.arg.string(),
        fileIds: t.arg.intList(),
        folderIds: t.arg.intList(),
      },
      resolve: async (_root, { state, prompt, fileIds, folderIds }, ctx) => {
        const userId = requireUserId(ctx);
        return proposeFlowStart(
          userId,
          state,
          prompt ?? null,
          fileIds,
          folderIds,
        );
      },
    }),

    refineFlowStartProposal: t.field({
      type: FlowStartProposal,
      args: {
        state: t.arg.string({ required: true }),
        selectedKey: t.arg.string({ required: true }),
        prompt: t.arg.string({ required: true }),
        fileIds: t.arg.intList(),
        folderIds: t.arg.intList(),
      },
      resolve: async (
        _root,
        { state, selectedKey, prompt, fileIds, folderIds },
        ctx,
      ) => {
        const userId = requireUserId(ctx);
        return proposeFlowStart(
          userId,
          state,
          prompt,
          fileIds,
          folderIds,
          selectedKey,
        );
      },
    }),

    draftFlowStartTask: t.field({
      type: FlowTaskDraft,
      args: {
        kind: t.arg({ type: FlowStartKind, required: true }),
        state: t.arg.string({ required: true }),
        prompt: t.arg.string(),
        fileIds: t.arg.intList(),
        folderIds: t.arg.intList(),
      },
      resolve: async (
        _root,
        { kind, state, prompt, fileIds, folderIds },
        ctx,
      ) => {
        const userId = requireUserId(ctx);
        return draftFlowStartTask(
          userId,
          kind as FlowStartKindValue,
          state,
          prompt ?? null,
          fileIds,
          folderIds,
        );
      },
    }),

    refineFlowTaskDraft: t.field({
      type: FlowTaskDraft,
      args: {
        draft: t.arg({ type: "JSON", required: true }),
        state: t.arg.string({ required: true }),
        prompt: t.arg.string({ required: true }),
      },
      resolve: async (_root, { draft, state, prompt }, ctx) => {
        const userId = requireUserId(ctx);
        return refineFlowTaskDraft(userId, draft, state, prompt);
      },
    }),

    confirmFlowStartDraft: t.field({
      type: FlowStartResult,
      args: {
        draft: t.arg({ type: "JSON", required: true }),
        state: t.arg.string({ required: true }),
        fileIds: t.arg.intList(),
        folderIds: t.arg.intList(),
        start: t.arg.boolean({ required: true }),
      },
      resolve: async (
        _root,
        { draft, state, fileIds, folderIds, start },
        ctx,
      ) => {
        const userId = requireUserId(ctx);
        return confirmFlowStartDraft(
          userId,
          draft,
          state,
          fileIds,
          folderIds,
          start,
        );
      },
    }),

    confirmNextStep: t.field({
      type: QueuedTask,
      args: {
        queuedTaskId: t.arg.int({ required: true }),
        taskId: t.arg.int(),
      },
      resolve: async (_root, { queuedTaskId, taskId }, ctx) => {
        const userId = requireUserId(ctx);
        return confirmNextStep(userId, queuedTaskId, taskId);
      },
    }),

    wireDecisionResultTarget: t.field({
      type: QueuedTask,
      args: {
        queuedTaskId: t.arg.int({ required: true }),
        resultId: t.arg.int({ required: true }),
        targetTaskId: t.arg.int({ required: true }),
      },
      resolve: async (_root, { queuedTaskId, resultId, targetTaskId }, ctx) => {
        const userId = requireUserId(ctx);
        return wireDecisionResultTarget(
          userId,
          queuedTaskId,
          resultId,
          targetTaskId,
        );
      },
    }),
  }),
});
