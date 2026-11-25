import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import type { ApiRuntime } from "../domain/types";
import { RequestInputError } from "../domain/request-input";
import { createInvokeRoute } from "./invoke-route";
import { createStatusRoute } from "./status-route";
import { createHealthRoute } from "./health-route";
import type {
  ApiRoute,
  ApiRouteContext,
  ApiUpgradeContext,
  ApiUpgradeRoute,
} from "./route-types";
import { HttpError, respondJson, setCorsHeaders } from "./respond";
import {
  createInvokeUpgradeRoute,
  createSubscribeUpgradeRoute,
} from "./websocket";

interface CompiledRoute<T> {
  route: T;
  regexp: RegExp;
  keys: string[];
}

export interface CreateApiRouterOptions {
  runtime: ApiRuntime;
  /** Additional HTTP routes, evaluated after the built-ins. */
  routes?: ApiRoute[];
  /** Additional WebSocket routes, evaluated after the built-ins. */
  upgradeRoutes?: ApiUpgradeRoute[];
}

export interface ApiRouter {
  /** Returns true when the request was handled (including 404/405). */
  handleRequest(req: IncomingMessage, res: ServerResponse): boolean;
  /** Returns true when the upgrade was handled. */
  handleUpgrade(
    req: IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ): boolean;
}

/**
 * Small route-table HTTP/WebSocket router for the outward API. Path patterns
 * use `:param` segments so new routes only need a path and a handler.
 */
export function createApiRouter({
  runtime,
  routes = [],
  upgradeRoutes = [],
}: CreateApiRouterOptions): ApiRouter {
  const wss = new WebSocketServer({ noServer: true });

  const httpRoutes = [
    createHealthRoute(),
    createInvokeRoute(runtime),
    createStatusRoute(),
    ...routes,
  ].map(compileHttpRoute);

  const wsRoutes = [
    createInvokeUpgradeRoute(runtime),
    createSubscribeUpgradeRoute(runtime),
    ...upgradeRoutes,
  ].map(compileUpgradeRoute);

  return {
    handleRequest(req, res) {
      const url = new URL(req.url ?? "/", "http://localhost");
      const isApiPath =
        url.pathname === "/api" || url.pathname.startsWith("/api/");

      if (!isApiPath && !httpRoutes.some((route) => route.regexp.test(url.pathname))) {
        return false;
      }

      setCorsHeaders(req, res);

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return true;
      }

      const pathMatches = httpRoutes.filter((route) =>
        route.regexp.test(url.pathname),
      );
      if (pathMatches.length === 0) {
        respondJson(res, 404, { error: "Not found" });
        return true;
      }

      const match = pathMatches.find(
        (route) => route.route.method === req.method,
      );
      if (!match) {
        res.setHeader(
          "Allow",
          pathMatches.map((route) => route.route.method).join(", "),
        );
        respondJson(res, 405, { error: "Method not allowed" });
        return true;
      }

      const context: ApiRouteContext = {
        req,
        res,
        url,
        params: matchParams(match, url.pathname),
        runtime,
      };

      void Promise.resolve(match.route.handle(context)).catch((err) => {
        respondError(res, err);
      });
      return true;
    },

    handleUpgrade(req, socket, head) {
      const url = new URL(req.url ?? "/", "http://localhost");
      const match = wsRoutes.find((route) => route.regexp.test(url.pathname));
      if (!match) return false;

      const context: ApiUpgradeContext = {
        req,
        socket,
        head,
        url,
        params: matchParams(match, url.pathname),
        runtime,
        wss,
      };

      void Promise.resolve(match.route.handle(context)).catch((err) => {
        const message = errorMessage(err);
        socket.write(
          `HTTP/1.1 ${errorStatus(err)} ${message}\r\n` +
            "Content-Type: text/plain; charset=utf-8\r\n" +
            "Connection: close\r\n" +
            `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n` +
            message,
        );
        socket.destroy();
      });
      return true;
    },
  };
}

function compileHttpRoute(route: ApiRoute): CompiledRoute<ApiRoute> {
  const compiled = compilePath(route.path);
  return { route, ...compiled };
}

function compileUpgradeRoute(
  route: ApiUpgradeRoute,
): CompiledRoute<ApiUpgradeRoute> {
  const compiled = compilePath(route.path);
  return { route, ...compiled };
}

function compilePath(path: string): { regexp: RegExp; keys: string[] } {
  const keys: string[] = [];
  const pattern = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (!segment.startsWith(":")) return escapeRegExp(segment);
      keys.push(segment.slice(1));
      return "([^/]+)";
    })
    .join("/");

  return { regexp: new RegExp(`^/${pattern}/?$`), keys };
}

function matchParams(
  compiled: { regexp: RegExp; keys: string[] },
  pathname: string,
): Record<string, string> {
  const match = compiled.regexp.exec(pathname);
  if (!match) return {};

  const params: Record<string, string> = {};
  compiled.keys.forEach((key, index) => {
    const value = match[index + 1];
    if (value === undefined) return;
    try {
      params[key] = decodeURIComponent(value);
    } catch {
      params[key] = value;
    }
  });
  return params;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function respondError(res: ServerResponse, err: unknown): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  respondJson(res, errorStatus(err), { error: errorMessage(err) });
}

function errorStatus(err: unknown): number {
  if (err instanceof HttpError) return err.statusCode;
  if (err instanceof RequestInputError) return err.statusCode;
  if (err instanceof Error && "statusCode" in err) {
    const status = (err as { statusCode?: unknown }).statusCode;
    if (typeof status === "number") return status;
  }
  return 500;
}

function errorMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof RequestInputError) return err.message;

  const status = errorStatus(err);
  if (status >= 500) {
    console.error("API request failed:", err);
    return "Internal server error";
  }

  return err instanceof Error ? err.message : "Request failed";
}
