import { builder } from "../../builder";
import { requireUserId } from "../../auth";
import { UserDecisionOption, UserDecisionOptionKind } from "./task";
import {
  createUserDecisionOption,
  deleteUserDecisionOption,
  updateUserDecisionOption,
} from "./user-decision-option-service";

builder.mutationType({
  fields: (t) => ({
    createUserDecisionOption: t.drizzleField({
      type: UserDecisionOption,
      args: {
        taskId: t.arg.int({ required: true }),
        kind: t.arg({ type: UserDecisionOptionKind, required: true }),
        label: t.arg.string(),
        description: t.arg.string(),
        value: t.arg.string(),
        selector: t.arg({ type: "JSON" }),
        labelPath: t.arg.string(),
        descriptionPath: t.arg.string(),
        valuePath: t.arg.string(),
        resultTaskId: t.arg.int(),
        appendState: t.arg.boolean(),
        sortOrder: t.arg.int(),
      },
      resolve: async (_query, _root, args, ctx) => {
        requireUserId(ctx);
        return createUserDecisionOption(args);
      },
    }),

    updateUserDecisionOption: t.drizzleField({
      type: UserDecisionOption,
      args: {
        id: t.arg.int({ required: true }),
        kind: t.arg({ type: UserDecisionOptionKind }),
        label: t.arg.string(),
        description: t.arg.string(),
        value: t.arg.string(),
        selector: t.arg({ type: "JSON" }),
        labelPath: t.arg.string(),
        descriptionPath: t.arg.string(),
        valuePath: t.arg.string(),
        resultTaskId: t.arg.int(),
        appendState: t.arg.boolean(),
        sortOrder: t.arg.int(),
      },
      resolve: async (_query, _root, args, ctx) => {
        requireUserId(ctx);
        return updateUserDecisionOption(args);
      },
    }),

    deleteUserDecisionOption: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        requireUserId(ctx);
        return deleteUserDecisionOption(id);
      },
    }),
  }),
});
