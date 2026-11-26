/**
 * Public backend origin resolution.
 *
 * The web server reads `API_PUBLIC_ORIGIN` at request time and passes it into
 * the client through `ApiOriginProvider`. That keeps the origin out of the
 * build while still giving both the server render and the browser the same
 * value.
 */
/** The port the backend listens on when it is not behind a reverse proxy. */
const DEFAULT_API_PORT = "4000";
const LOCAL_API_ORIGIN = `http://localhost:${DEFAULT_API_PORT}`;

interface OriginLocation {
  protocol: string;
  hostname: string;
  port: string;
  origin: string;
}

/** Trims whitespace and trailing slashes from a configured origin. */
export function normalizeApiOrigin(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

/**
 * Pure resolution logic, exported for tests. `configured` is the runtime
 * setting from the server; `location` is the browser location when running
 * client-side.
 */
export function resolveApiOrigin(input: {
  configured?: unknown;
  location?: OriginLocation;
}): string {
  const configured = normalizeApiOrigin(input.configured);
  if (configured) return configured;

  const { location } = input;
  if (!location) return LOCAL_API_ORIGIN;

  // Default ports normally mean a reverse proxy serves both apps.
  if (
    location.port === "" ||
    location.port === "80" ||
    location.port === "443"
  ) {
    return location.origin;
  }

  // Keep the API on its default port when the web app is hosted elsewhere.
  return `${location.protocol}//${location.hostname}:${DEFAULT_API_PORT}`;
}

/** The browser location, or `undefined` during server rendering. */
export function currentOriginLocation(): OriginLocation | undefined {
  return typeof window === "undefined" ? undefined : window.location;
}
