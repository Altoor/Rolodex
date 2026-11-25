import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { requireUserId } from "../auth";
import {
  createApiEndpoint,
  deleteApiEndpoint,
  EndpointSlugConflictError,
  InvalidEndpointSlugError,
  rotateApiEndpointKey,
  rotateStandardApiKey as rotateStandardKey,
  TaskNotVisibleError,
  updateApiEndpoint,
} from "@repo/api";
import {
  ApiEndpoint,
  CreatedApiEndpointType,
  CreatedStandardApiKeyType,
} from "./api-endpoint";

/** Maps slug validation failures to user-facing GraphQL errors. */
function asApiInputError(err: unknown): never {
  if (
    err instanceof InvalidEndpointSlugError ||
    err instanceof EndpointSlugConflictError ||
    err instanceof TaskNotVisibleError
  ) {
    throw new GraphQLError(err.message, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  throw err;
}

builder.mutationType({
  fields: (t) => ({
    createApiEndpoint: t.field({
      type: CreatedApiEndpointType,
      args: {
        name: t.arg.string({ required: true }),
        taskId: t.arg.int({ required: true }),
        description: t.arg.string(),
        stateField: t.arg.string(),
        slug: t.arg.string(),
      },
      resolve: async (
        _root,
        { name, taskId, description, stateField, slug },
        ctx,
      ) => {
        try {
          return await createApiEndpoint(requireUserId(ctx), {
            name,
            taskId,
            description: description ?? undefined,
            stateField: stateField ?? null,
            slug: slug ?? null,
          });
        } catch (err) {
          throw asApiInputError(err);
        }
      },
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
        slug: t.arg.string(),
      },
      resolve: async (
        _root,
        { id, name, description, taskId, stateField, enabled, slug },
        ctx,
      ) => {
        try {
          return await updateApiEndpoint(requireUserId(ctx), String(id), {
            name: name ?? undefined,
            description: description ?? undefined,
            taskId: taskId ?? undefined,
            // Null means "not provided" so toggle-only updates keep the field.
            // An empty string explicitly clears it.
            stateField: stateField ?? undefined,
            enabled: enabled ?? undefined,
            slug: slug ?? undefined,
          });
        } catch (err) {
          throw asApiInputError(err);
        }
      },
    }),

    rotateApiEndpointKey: t.field({
      type: CreatedApiEndpointType,
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: async (_root, { id }, ctx) =>
        rotateApiEndpointKey(requireUserId(ctx), String(id)),
    }),

    rotateStandardApiKey: t.field({
      type: CreatedStandardApiKeyType,
      description:
        "Creates or replaces the user's dedicated key for the /api/v1 surface.",
      resolve: async (_root, _args, ctx) =>
        rotateStandardKey(requireUserId(ctx)),
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
