import { builder } from "../builder";
import { requireUserId } from "../auth";
import {
  createApiEndpoint,
  deleteApiEndpoint,
  rotateApiEndpointKey,
  updateApiEndpoint,
} from "@repo/api";
import { ApiEndpoint, CreatedApiEndpointType } from "./api-endpoint";

builder.mutationType({
  fields: (t) => ({
    createApiEndpoint: t.field({
      type: CreatedApiEndpointType,
      args: {
        name: t.arg.string({ required: true }),
        taskId: t.arg.int({ required: true }),
        description: t.arg.string(),
        stateField: t.arg.string(),
      },
      resolve: async (
        _root,
        { name, taskId, description, stateField },
        ctx,
      ) =>
        createApiEndpoint(requireUserId(ctx), {
          name,
          taskId,
          description: description ?? undefined,
          stateField: stateField ?? null,
        }),
    }),

    updateApiEndpoint: t.field({
      type: ApiEndpoint,
      args: {
        id: t.arg.id({ required: true }),
        name: t.arg.string(),
        description: t.arg.string(),
        taskId: t.arg.int(),
        stateField: t.arg.string(),
        enabled: t.arg.boolean(),
      },
      resolve: async (
        _root,
        { id, name, description, taskId, stateField, enabled },
        ctx,
      ) =>
        updateApiEndpoint(requireUserId(ctx), String(id), {
          name: name ?? undefined,
          description: description ?? undefined,
          taskId: taskId ?? undefined,
          // Null means "not provided" so toggle-only updates keep the field.
          // An empty string explicitly clears it.
          stateField: stateField ?? undefined,
          enabled: enabled ?? undefined,
        }),
    }),

    rotateApiEndpointKey: t.field({
      type: CreatedApiEndpointType,
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: async (_root, { id }, ctx) =>
        rotateApiEndpointKey(requireUserId(ctx), String(id)),
    }),

    deleteApiEndpoint: t.field({
      type: "Boolean",
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: async (_root, { id }, ctx) =>
        deleteApiEndpoint(requireUserId(ctx), String(id)),
    }),
  }),
});
