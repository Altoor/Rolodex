import { ensureFilesRootSync } from "@repo/tools/tools/file/services/paths";

export const TOKEN_SECRET: string =
  process.env.TOKEN_SECRET ??
  (() => {
    throw new Error("TOKEN_SECRET environment variable is required");
  })();

const DEFAULT_AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function readAuthTokenTtl(): number {
  const configured = Number(process.env.AUTH_TOKEN_TTL_SECONDS);

  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }

  return DEFAULT_AUTH_TOKEN_TTL_SECONDS;
}

/**
 * Lifetime of browser auth tokens. Existing tokens without `exp` (issued
 * before expiry was enforced) are rejected by `extractUser`, so users sign in
 * again once after upgrading.
 */
export const AUTH_TOKEN_TTL_SECONDS: number = readAuthTokenTtl();

/**
 * Validate and create the shared files root at startup. FILES_ROOT defaults
 * to <repo>/files; see packages/tools/src/tools/file/services/paths.ts.
 */
export const FILES_ROOT: string = ensureFilesRootSync();
