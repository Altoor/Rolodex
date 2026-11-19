import { builder } from "../builder";
import { requireUserId } from "../auth";
import { QueuedTask } from "../task/queuedtask/queued-task";
import { UserDecisionOption } from "../task/task/task";
import {
  createUserDecisionOptions,
  refreshUserDecisionOptions,
  suggestUserDecisionOptions,
  type UserDecisionOptionDraft as UserDecisionOptionDraftModel,
} from "./user-decision-revision-service";

const UserDecisionOptionDraft = builder
  .objectRef<UserDecisionOptionDraftModel>("UserDecisionOptionDraft")
  .implement({
    fields: (t) => ({
      label: t.exposeString("label"),
      description: t.exposeString("description", { nullable: true }),
      value: t.exposeString("value"),
      resultTaskId: t.exposeInt("resultTaskId", { nullable: true }),
      resultTaskName: t.exposeString("resultTaskName", { nullable: true }),
    }),
  });

builder.mutationType({
  fields: (t) => ({
    suggestUserDecisionOptions: t.field({
      type: [UserDecisionOptionDraft],
      args: {
        taskId: t.arg.int({ required: true }),
        state: t.arg.string(),
        prompt: t.arg.string({ required: true }),
      },
      resolve: async (_root, { taskId, state, prompt }, ctx) => {
        const userId = requireUserId(ctx);
        return suggestUserDecisionOptions(userId, taskId, state ?? null, prompt);
      },
    }),

    createUserDecisionOptions: t.field({
      type: [UserDecisionOption],
      args: {
        taskId: t.arg.int({ required: true }),
        options: t.arg({ type: "JSON", required: true }),
      },
      resolve: async (_root, { taskId, options }, ctx) => {
        const userId = requireUserId(ctx);
        return createUserDecisionOptions(userId, taskId, options);
      },
    }),

    refreshUserDecisionOptions: t.field({
      type: QueuedTask,
      args: {
        queuedTaskId: t.arg.int({ required: true }),
      },
      resolve: async (_root, { queuedTaskId }, ctx) => {
        const userId = requireUserId(ctx);
        return refreshUserDecisionOptions(userId, queuedTaskId);
      },
    }),
  }),
});
