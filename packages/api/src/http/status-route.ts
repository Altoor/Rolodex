import { getFlowSnapshot } from "../domain/flow-status";
import { getApiRequest } from "../repository/requests";
import { authenticateEndpoint } from "./endpoint-auth";
import type { ApiRoute } from "./route-types";
import { HttpError, respondJson } from "./respond";

/** GET /api/hooks/:slug/requests/:requestId — public flow status/result. */
export function createStatusRoute(): ApiRoute {
  return {
    method: "GET",
    path: "/api/hooks/:slug/requests/:requestId",
    async handle({ req, res, url, params }) {
      const endpoint = await authenticateEndpoint(req, url, params.slug!);
      const request = await getApiRequest(endpoint.id, params.requestId!);
      if (!request) {
        throw new HttpError("Unknown API request", 404);
      }

      const snapshot = await getFlowSnapshot(endpoint, request);
      if (!snapshot) {
        throw new HttpError("The request's run no longer exists", 404);
      }

      respondJson(res, 200, snapshot);
    },
  };
}
