import { builder } from "../builder";
import { requireUserId } from "../auth";
import {
  getApiEndpoint,
  listApiEndpoints,
  listApiRequests,
} from "@repo/api";
import { ApiEndpoint, ApiRequest } from "./api-endpoint";

builder.queryType({
  fields: (t) => ({
    apiEndpoints: t.field({
      type: [ApiEndpoint],
      description: "The current user's outward API endpoints.",
      resolve: async (_root, _args, ctx) =>
        listApiEndpoints(requireUserId(ctx)),
    }),

    apiRequests: t.field({
      type: [ApiRequest],
      description: "Recent invocations for one of the user's endpoints.",
      args: {
        endpointId: t.arg.id({ required: true }),
        limit: t.arg.int({ defaultValue: 20 }),
      },
      resolve: async (_root, { endpointId, limit }, ctx) => {
        const userId = requireUserId(ctx);
        const endpoint = await getApiEndpoint(userId, String(endpointId));
        if (!endpoint) return [];
        return listApiRequests(endpoint.id, limit ?? 20);
      },
    }),
  }),
});
