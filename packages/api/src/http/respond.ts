import type { IncomingMessage, ServerResponse } from "node:http";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-API-Key",
  );
}

export function respondJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function requestOrigin(req: IncomingMessage): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : (req.socket as { encrypted?: boolean }).encrypted === true
        ? "https"
        : "http";
  const host = req.headers.host ?? "localhost:4000";

  return `${proto}://${host}`;
}

/** Reads a key from the standard header or the WebSocket-friendly query. */
export function readApiKey(req: IncomingMessage, url: URL): string | null {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const authorization = req.headers.authorization;
  if (authorization) {
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) return token;
  }

  const queryKey = url.searchParams.get("key");
  return queryKey?.trim() || null;
}
