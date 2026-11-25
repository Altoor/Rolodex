import type { WebSocket } from "ws";
import { getFlowSnapshot } from "../domain/flow-status";
import { stateFromValue } from "../domain/request-input";
import type {
  ApiEndpointRow,
  ApiRequestRow,
  ApiRuntime,
} from "../domain/types";
import { getApiRequest, createApiRequest } from "../repository/requests";
import { authenticateEndpoint } from "./endpoint-auth";
import type { ApiUpgradeRoute } from "./route-types";
import { HttpError, requestOrigin } from "./respond";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function send(ws: WebSocket, body: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(body));
}

function closeWithError(ws: WebSocket, message: string): void {
  send(ws, { type: "error", error: message });
  ws.close(1011, message.slice(0, 120));
}

/**
 * Streams status snapshots until the run is terminal. Both the queue event and
 * a slow fallback timer trigger a refresh, so a missed in-process event cannot
 * leave a client waiting forever.
 */
function streamRequest(input: {
  ws: WebSocket;
  runtime: ApiRuntime;
  endpoint: ApiEndpointRow;
  request: ApiRequestRow;
}): void {
  const { ws, runtime, endpoint, request } = input;
  let stopped = false;
  let busy = false;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    unsubscribe();
  };

  const publish = async () => {
    if (stopped || busy) return;
    busy = true;

    try {
      const snapshot = await getFlowSnapshot(endpoint, request);
      if (!snapshot) {
        closeWithError(ws, "The request's run no longer exists");
        cleanup();
        return;
      }

      send(ws, {
        type: TERMINAL.has(snapshot.status) ? "done" : "status",
        data: snapshot,
      });

      if (TERMINAL.has(snapshot.status)) {
        cleanup();
        ws.close(1000, "Flow finished");
      }
    } catch (err) {
      closeWithError(
        ws,
        err instanceof Error ? err.message : "Failed to read flow status",
      );
      cleanup();
    } finally {
      busy = false;
    }
  };

  const unsubscribe = runtime.onRunEvent(request.runId, () => {
    void publish();
  });
  const timer = setInterval(() => {
    void publish();
  }, 2000);

  ws.on("close", cleanup);
  ws.on("error", cleanup);
  void publish();
}

/** Validates the endpoint and upgrades the connection. */
async function upgrade(
  context: Parameters<ApiUpgradeRoute["handle"]>[0],
  onOpen: (ws: WebSocket) => void,
): Promise<boolean> {
  context.wss.handleUpgrade(
    context.req,
    context.socket,
    context.head,
    (ws) => {
      try {
        onOpen(ws);
      } catch (err) {
        closeWithError(
          ws,
          err instanceof Error ? err.message : "WebSocket setup failed",
        );
      }
    },
  );
  return true;
}

/** WS /api/hooks/:slug/requests/:requestId/ws — subscribe to a request. */
export function createSubscribeUpgradeRoute(runtime: ApiRuntime): ApiUpgradeRoute {
  return {
    path: "/api/hooks/:slug/requests/:requestId/ws",
    async handle(context) {
      const endpoint = await authenticateEndpoint(
        context.req,
        context.url,
        context.params.slug!,
        { allowQueryKey: true },
      );
      const request = await getApiRequest(
        endpoint.id,
        context.params.requestId!,
      );
      if (!request) throw new HttpError("Unknown API request", 404);

      return upgrade(context, (ws) => {
        send(ws, { type: "accepted", requestId: request.id, runId: request.runId });
        streamRequest({ ws, runtime, endpoint, request });
      });
    },
  };
}

/** WS /api/hooks/:slug/ws — accept one JSON message, then stream its status. */
export function createInvokeUpgradeRoute(runtime: ApiRuntime): ApiUpgradeRoute {
  return {
    path: "/api/hooks/:slug/ws",
    async handle(context) {
      const endpoint = await authenticateEndpoint(
        context.req,
        context.url,
        context.params.slug!,
        { allowQueryKey: true },
      );

      return upgrade(context, (ws) => {
        let started = false;

        ws.on("message", (data, isBinary) => {
          if (started) return;
          started = true;

          void (async () => {
            try {
              if (isBinary) {
                closeWithError(ws, "WebSocket requests must be JSON text");
                return;
              }

              let body: unknown;
              try {
                body = JSON.parse(data.toString());
              } catch {
                closeWithError(ws, "WebSocket request is not valid JSON");
                return;
              }

              const state = stateFromValue(body, endpoint);
              const queued = await runtime.queueFlow({
                userId: endpoint.userId,
                taskId: endpoint.taskId,
                state,
              });
              let request;
              try {
                request = await createApiRequest({
                  endpointId: endpoint.id,
                  userId: endpoint.userId,
                  runId: queued.runId,
                  state,
                });
              } catch (err) {
                if (runtime.cancelFlow) {
                  await runtime.cancelFlow(queued.runId).catch(() => undefined);
                }
                throw err;
              }

              const origin = requestOrigin(context.req);
              const statusUrl = `${origin}/api/hooks/${endpoint.slug}/requests/${request.id}`;
              send(ws, {
                type: "accepted",
                requestId: request.id,
                runId: request.runId,
                statusUrl,
              });
              streamRequest({ ws, runtime, endpoint, request });
            } catch (err) {
              closeWithError(
                ws,
                err instanceof Error ? err.message : "Failed to start flow",
              );
            }
          })();
        });

        ws.on("close", () => {
          if (!started) ws.terminate();
        });
      });
    },
  };
}
