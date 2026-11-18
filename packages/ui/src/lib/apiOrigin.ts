/**
 * Next replaces `process.env.NEXT_PUBLIC_*` references in client bundles, but
 * the UI package does not depend on Node types.
 */
declare const process: {
  env: { NEXT_PUBLIC_API_ORIGIN?: string };
};

/** The port the backend listens on when it is not behind a reverse proxy. */
const DEFAULT_API_PORT = "4000";
const LOCAL_API_ORIGIN = `http://localhost:${DEFAULT_API_PORT}`;

function configuredApiOrigin(): string | undefined {
  const value =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_ORIGIN
      : undefined;

  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

/**
 * Resolves the backend origin.
 *
 * `NEXT_PUBLIC_API_ORIGIN` wins when set. Otherwise the browser assumes the
 * API shares its host and uses the default backend port; a web app behind a
 * reverse proxy on port 80/443 uses its own origin. Server rendering falls
 * back to the local backend used by `pnpm dev`.
 */
export function resolveApiOrigin(): string {
  const configured = configuredApiOrigin();
  if (configured) return configured;

  if (typeof window === "undefined") return LOCAL_API_ORIGIN;

  const { protocol, hostname, port, origin } = window.location;

  // Default ports normally mean a reverse proxy serves both apps.
  if (port === "" || port === "80" || port === "443") return origin;

  // Keep the API on its default port when the web app is hosted elsewhere.
  return `${protocol}//${hostname}:${DEFAULT_API_PORT}`;
}

export const API_ORIGIN = resolveApiOrigin();
