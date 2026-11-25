import type { ApiRuntime } from "../domain/types";
import { parseInvocation } from "../domain/request-input";
import { createApiRequest } from "../repository/requests";
import { authenticateEndpoint } from "./endpoint-auth";
import type { ApiRoute } from "./route-types";
import { requestOrigin, respondJson } from "./respond";

/** POST /api/hooks/:slug — queue the endpoint's task. */
export function createInvokeRoute(runtime: ApiRuntime): ApiRoute {
  return {
    method: "POST",
    path: "/api/hooks/:slug",
    async handle({ req, res, url, params }) {
      const endpoint = await authenticateEndpoint(req, url, params.slug!);
      const input = await parseInvocation(req, endpoint);
      const uploaded =
        input.files.length > 0
          ? await runtime.uploadFiles(input.files)
          : [];
      const queued = await runtime.queueFlow({
        userId: endpoint.userId,
        taskId: endpoint.taskId,
        state: input.state,
        fileIds: uploaded.map((file) => file.id),
      });
      let request;
      try {
        request = await createApiRequest({
          endpointId: endpoint.id,
          userId: endpoint.userId,
          runId: queued.runId,
          state: input.state,
        });
      } catch (err) {
        // The run must not execute without a status row the caller can poll.
        if (runtime.cancelFlow) {
          await runtime.cancelFlow(queued.runId).catch(() => undefined);
        }
        throw err;
      }

      const origin = requestOrigin(req);
      const statusUrl = `${origin}/api/hooks/${endpoint.slug}/requests/${request.id}`;
      const websocketUrl = statusUrl.replace(/^http/, "ws") + "/ws";

      respondJson(res, 202, {
        accepted: true,
        requestId: request.id,
        runId: queued.runId,
        status: "accepted",
        statusUrl,
        websocketUrl,
      });
    },
  };
}
