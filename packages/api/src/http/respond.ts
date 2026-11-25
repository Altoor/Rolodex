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

/** Parsed CORS allowlist. `*` allows any origin explicitly. */
function corsAllowlist(): string[] {
  return (process.env.API_CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function setCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  // Never reflect arbitrary origins: reflect only configured ones. With no
  // allowlist the outward API stays same-origin, which is safe by default.
  res.setHeader("Vary", "Origin");
  const origin = req.headers.origin;
  if (!origin) return;

  const allowlist = corsAllowlist();
  if (allowlist.includes("*") || allowlist.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-API-Key",
    );
  }
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

/**
 * The public base URL used in `statusUrl` / `websocketUrl`. Prefer an explicit
 * `API_PUBLIC_ORIGIN` so a spoofed `Host` header cannot influence responses.
 */
export function requestOrigin(req: IncomingMessage): string {
  const configured = process.env.API_PUBLIC_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : (req.socket as { encrypted?: boolean }).encrypted === true
        ? "https"
        : "http";
  const host = req.headers.host ?? "localhost:4000";

  // Even in the local fallback, only accept a host-shaped value.
  const safeHost = /^[a-zA-Z0-9.\-:[\]]+$/.test(host) ? host : "localhost:4000";
  return `${proto}://${safeHost}`;
}

export interface ReadApiKeyOptions {
  /** WebSocket upgrades have no headers, so they may pass `?key=`. */
  allowQuery?: boolean;
}

/** Reads a key from the standard header or, when allowed, the query string. */
export function readApiKey(
  req: IncomingMessage,
  url: URL,
  options: ReadApiKeyOptions = {},
): string | null {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const authorization = req.headers.authorization;
  if (authorization) {
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) return token;
  }

  if (!options.allowQuery) return null;
  const queryKey = url.searchParams.get("key");
  return queryKey?.trim() || null;
}
