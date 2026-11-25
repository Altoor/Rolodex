import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { WebSocketServer } from "ws";
import type { ApiRuntime } from "../domain/types";

export interface ApiRouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  runtime: ApiRuntime;
}

export interface ApiRoute {
  method: string;
  /** Path pattern such as `/api/hooks/:slug`. */
  path: string;
  handle(context: ApiRouteContext): Promise<void> | void;
}

export interface ApiUpgradeContext {
  req: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  url: URL;
  params: Record<string, string>;
  runtime: ApiRuntime;
  wss: WebSocketServer;
}

export interface ApiUpgradeRoute {
  /** Path pattern such as `/api/hooks/:slug/ws`. */
  path: string;
  handle(context: ApiUpgradeContext): Promise<boolean> | boolean;
}
