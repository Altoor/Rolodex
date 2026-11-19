import { builder } from "../builder";
import { requireUserId } from "../auth";
import { QueuedTask } from "../task/queuedtask/queued-task";
import {
  getDecisionReviewContext,
  reviewDecisionStep,
  type DecisionReviewChoice as DecisionReviewChoiceModel,
  type DecisionReviewContext as DecisionReviewContextModel,
  type DecisionReviewResult as DecisionReviewResultModel,
} from "./decision-review-service";

const DecisionReviewChoice = builder
  .objectRef<DecisionReviewChoiceModel>("DecisionReviewChoice")
  .implement({
    fields: (t) => ({
      id: t.exposeInt("id"),
      label: t.exposeString("label"),
      option: t.exposeString("option", { nullable: true }),
      type: t.exposeString("type"),
      targetTaskId: t.exposeInt("targetTaskId", { nullable: true }),
      targetTaskName: t.exposeString("targetTaskName", { nullable: true }),
      scoreThreshold: t.exposeFloat("scoreThreshold", { nullable: true }),
      probabilityThreshold: t.exposeFloat("probabilityThreshold", {
        nullable: true,
      }),
      confidenceThreshold: t.exposeFloat("confidenceThreshold", {
        nullable: true,
      }),
      bias: t.exposeFloat("bias"),
      matched: t.exposeBoolean("matched"),
    }),
  });

const DecisionReviewContext = builder
  .objectRef<DecisionReviewContextModel>("DecisionReviewContext")
  .implement({
    fields: (t) => ({
      queuedTaskId: t.exposeInt("queuedTaskId"),
      taskId: t.exposeInt("taskId"),
      taskName: t.exposeString("taskName"),
      decisionId: t.exposeInt("decisionId", { nullable: true }),
      decisionName: t.exposeString("decisionName", { nullable: true }),
      decisionType: t.exposeString("decisionType", { nullable: true }),
      decisionPremise: t.exposeString("decisionPremise", { nullable: true }),
      instruction: t.exposeString("instruction", { nullable: true }),
      model: t.exposeString("model", { nullable: true }),
      rawAnswer: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => (parent.rawAnswer as object | null) ?? null,
      }),
      effectiveAnswer: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => (parent.effectiveAnswer as object | null) ?? null,
      }),
      matchedResultId: t.exposeInt("matchedResultId", { nullable: true }),
      results: t.field({
        type: [DecisionReviewChoice],
        resolve: (parent) => parent.results,
      }),
      review: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => (parent.review as object | null) ?? null,
      }),
      canReview: t.exposeBoolean("canReview"),
    }),
  });

const DecisionReviewResult = builder
  .objectRef<DecisionReviewResultModel>("DecisionReviewResult")
  .implement({
    fields: (t) => ({
      queuedTask: t.field({
        type: QueuedTask,
        resolve: (parent) => parent.queuedTask,
      }),
      review: t.field({
        type: DecisionReviewContext,
        resolve: (parent) => parent.review,
      }),
    }),
  });

builder.queryType({
  fields: (t) => ({
    decisionReview: t.field({
      type: DecisionReviewContext,
      args: {
        queuedTaskId: t.arg.int({ required: true }),
      },
      resolve: async (_root, { queuedTaskId }, ctx) => {
        const userId = requireUserId(ctx);
        return getDecisionReviewContext(userId, queuedTaskId);
      },
    }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    reviewDecisionStep: t.field({
      type: DecisionReviewResult,
      args: {
        queuedTaskId: t.arg.int({ required: true }),
        correct: t.arg.boolean({ required: true }),
        actualResultId: t.arg.int(),
      },
      resolve: async (
        _root,
        { queuedTaskId, correct, actualResultId },
        ctx,
      ) => {
        const userId = requireUserId(ctx);
        return reviewDecisionStep(
          userId,
          queuedTaskId,
          correct,
          actualResultId ?? null,
        );
      },
    }),
  }),
});
