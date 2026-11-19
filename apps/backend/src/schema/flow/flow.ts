import { builder } from "../builder";
import { QueuedTask } from "../task/queuedtask/queued-task";
import { TaskType, ToolOutputType } from "../task/task/task";
import type {
  FlowStartCandidate as FlowStartCandidateModel,
  FlowStartKind as FlowStartKindModel,
  FlowStartProposal as FlowStartProposalModel,
} from "./flow-proposal-service";
import type { FlowTaskDraft as FlowTaskDraftModel } from "./flow-draft-service";
import type { FlowStartResult as FlowStartResultModel } from "./flow-start-service";

export const FlowStartKind = builder.enumType("FlowStartKind", {
  values: [
    "existingTask",
    "newToolTask",
    "newDecisionTask",
    "newUserDecisionTask",
  ] as const,
});

export const FlowStartCandidate = builder
  .objectRef<FlowStartCandidateModel>("FlowStartCandidate")
  .implement({
    fields: (t) => ({
      key: t.exposeString("key"),
      kind: t.field({
        type: FlowStartKind,
        resolve: (parent) => parent.kind as FlowStartKindModel,
      }),
      taskId: t.exposeInt("taskId", { nullable: true }),
      label: t.exposeString("label"),
      description: t.exposeString("description"),
      confidence: t.exposeFloat("confidence", { nullable: true }),
    }),
  });

export const FlowStartProposal = builder
  .objectRef<FlowStartProposalModel>("FlowStartProposal")
  .implement({
    fields: (t) => ({
      candidates: t.field({
        type: [FlowStartCandidate],
        resolve: (parent) => parent.candidates,
      }),
      recommendedKey: t.exposeString("recommendedKey"),
      reason: t.exposeString("reason"),
      model: t.exposeString("model", { nullable: true }),
      rawAnswer: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => (parent.rawAnswer as object | null) ?? null,
      }),
    }),
  });

export const FlowTaskDraft = builder
  .objectRef<FlowTaskDraftModel>("FlowTaskDraft")
  .implement({
    fields: (t) => ({
      kind: t.field({
        type: FlowStartKind,
        resolve: (parent) => parent.kind,
      }),
      name: t.exposeString("name"),
      type: t.field({
        type: TaskType,
        resolve: (parent) => parent.type,
      }),
      toolKey: t.exposeString("toolKey", { nullable: true }),
      toolConfig: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => (parent.toolConfig as object | null) ?? null,
      }),
      toolOutputType: t.field({
        type: ToolOutputType,
        resolve: (parent) => parent.toolOutputType,
      }),
      fallbackTaskId: t.exposeInt("fallbackTaskId", { nullable: true }),
      decision: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => (parent.decision as object | null) ?? null,
      }),
      userDecision: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => (parent.userDecision as object | null) ?? null,
      }),
      warnings: t.exposeStringList("warnings"),
      model: t.exposeString("model"),
    }),
  });

export const FlowStartResult = builder
  .objectRef<FlowStartResultModel>("FlowStartResult")
  .implement({
    fields: (t) => ({
      taskId: t.exposeInt("taskId"),
      taskName: t.exposeString("taskName"),
      created: t.exposeBoolean("created"),
      queuedTask: t.field({
        type: QueuedTask,
        nullable: true,
        resolve: (parent) => parent.queuedTask ?? null,
      }),
      warnings: t.exposeStringList("warnings", { nullable: true }),
    }),
  });
