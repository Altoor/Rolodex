import { ensureFilesRootSync } from "@repo/tools/tools/file/services/paths";

export const TOKEN_SECRET: string =
  process.env.TOKEN_SECRET ??
  (() => {
    throw new Error("TOKEN_SECRET environment variable is required");
  })();

/**
 * Validate and create the shared files root at startup. FILES_ROOT defaults
 * to <repo>/files; see packages/tools/src/tools/file/services/paths.ts.
 */
export const FILES_ROOT: string = ensureFilesRootSync();
