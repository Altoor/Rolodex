import fs from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Filesystem workspace configuration and path safety.
 *
 * The physical tree is a single shared `files/` directory at the repository
 * root. Every path accepted from a tool, GraphQL argument, or upload is
 * normalized to POSIX separators and validated against this root before any
 * filesystem call.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `<repo>/packages/tools/src/tools/file/services` -> `<repo>`. */
const REPO_ROOT = path.resolve(HERE, "../../../../../../");

/** Default root, overridable with FILES_ROOT. */
export const FILES_ROOT: string = path.resolve(
  process.env.FILES_ROOT ?? path.join(REPO_ROOT, "files"),
);

/** Name of the upload staging directory inside the root. */
export const TEMP_DIR_NAME = ".tmp";

const IGNORED_NAMES = new Set([
  ".gitkeep",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
]);

const WINDOWS_DRIVE = /^[a-zA-Z]:/;

export class FilesystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilesystemError";
  }
}

/** True when a string contains NUL or any ASCII control character. */
export function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Removes NUL and ASCII control characters from a string. */
export function stripControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code > 0x1f && code !== 0x7f) result += character;
  }
  return result;
}

/** Creates the shared root (and its `.gitkeep`) if it does not exist yet. */
export async function ensureFilesRoot(): Promise<string> {
  await fs.mkdir(FILES_ROOT, { recursive: true });

  const gitkeep = path.join(FILES_ROOT, ".gitkeep");
  try {
    await fs.access(gitkeep);
  } catch {
    await fs.writeFile(gitkeep, "", { flag: "wx" }).catch(() => undefined);
  }

  return FILES_ROOT;
}

/** Synchronous variant used during backend startup. */
export function ensureFilesRootSync(): string {
  mkdirSync(FILES_ROOT, { recursive: true });

  const gitkeep = path.join(FILES_ROOT, ".gitkeep");
  if (!existsSync(gitkeep)) {
    writeFileSync(gitkeep, "", { flag: "wx" });
  }

  return FILES_ROOT;
}

/**
 * Normalizes a user-supplied relative path to a POSIX path under the root.
 * Rejects absolute paths, traversal, control characters, and NUL bytes.
 */
export function normalizeRelativePath(
  input: string,
  options: { allowRoot?: boolean } = {},
): string {
  if (typeof input !== "string") {
    throw new FilesystemError("path must be a string");
  }

  const raw = input.trim();
  if (!raw) {
    if (options.allowRoot) return "";
    throw new FilesystemError("path is required");
  }

  if (containsControlCharacters(raw)) {
    throw new FilesystemError("path contains control characters");
  }

  const posix = raw.replace(/\\/g, "/");

  if (posix.startsWith("/") || WINDOWS_DRIVE.test(posix)) {
    throw new FilesystemError("absolute paths are not allowed");
  }

  const segments = posix
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");

  for (const segment of segments) {
    if (segment === "..") {
      throw new FilesystemError('path traversal ("..") is not allowed');
    }
    if (containsControlCharacters(segment)) {
      throw new FilesystemError("path contains control characters");
    }
  }

  if (segments.length === 0) {
    if (options.allowRoot) return "";
    throw new FilesystemError("path is required");
  }

  return segments.join("/");
}

/** Resolves a validated relative path to an absolute path inside the root. */
export function resolveFilesPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath, { allowRoot: true });
  const resolved = path.resolve(FILES_ROOT, normalized);
  assertInsideRoot(resolved);
  return resolved;
}

/** Converts an absolute path inside the root back to a POSIX relative path. */
export function toRelativePath(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  assertInsideRoot(resolved);

  const relative = path.relative(FILES_ROOT, resolved);
  return relative.split(path.sep).join("/");
}

function assertInsideRoot(resolved: string): void {
  if (resolved !== FILES_ROOT && !resolved.startsWith(FILES_ROOT + path.sep)) {
    throw new FilesystemError("path escapes FILES_ROOT");
  }
}

/**
 * Verifies that the real path of `absolutePath` (or its nearest existing
 * ancestor) is still inside the real root. This blocks symlink escapes even
 * though scans never follow symlinks.
 */
export async function assertRealPathInsideRoot(
  absolutePath: string,
): Promise<void> {
  const realRoot = await fs.realpath(FILES_ROOT);
  let current = path.resolve(absolutePath);

  for (;;) {
    try {
      const real = await fs.realpath(current);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
        throw new FilesystemError("path escapes FILES_ROOT via a symlink");
      }
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;

      const parent = path.dirname(current);
      if (parent === current) return;
      current = parent;
    }
  }
}

/**
 * Validates a single basename (file or folder name). Names never contain
 * separators, so a rename/move can only change one tree level.
 */
export function validateEntryName(name: string): string {
  if (typeof name !== "string") {
    throw new FilesystemError("name must be a string");
  }

  const trimmed = name.trim();
  if (!trimmed) {
    throw new FilesystemError("name is required");
  }

  if (trimmed === "." || trimmed === "..") {
    throw new FilesystemError(`invalid name "${trimmed}"`);
  }

  if (/[\\/]/.test(trimmed)) {
    throw new FilesystemError("name must not contain path separators");
  }

  if (containsControlCharacters(trimmed)) {
    throw new FilesystemError("name contains control characters");
  }

  if (Buffer.byteLength(trimmed, "utf8") > 255) {
    throw new FilesystemError("name is too long");
  }

  return trimmed;
}

/** Joins a validated parent path and a validated basename. */
export function joinRelativePath(parentPath: string, name: string): string {
  const parent = parentPath ? normalizeRelativePath(parentPath) : "";
  const safeName = validateEntryName(name);
  return parent ? `${parent}/${safeName}` : safeName;
}

/** Returns the parent relative path ("" for top level). */
export function parentRelativePath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath, { allowRoot: true });
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

/** Returns the basename of a validated relative path. */
export function basename(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/** True when a path segment should never be indexed. */
export function isIgnoredName(name: string): boolean {
  return IGNORED_NAMES.has(name) || name.startsWith(".tmp-");
}

/** True when a normalized relative path is inside an ignored location. */
export function isIgnoredPath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath, { allowRoot: true });
  if (!normalized) return false;

  const segments = normalized.split("/");
  const last = segments[segments.length - 1];
  if (last && isIgnoredName(last)) return true;

  return segments.includes(TEMP_DIR_NAME);
}

/** True when a relative path is the root or lies below it (always true here). */
export function isWithinRoot(relativePath: string): boolean {
  try {
    resolveFilesPath(relativePath);
    return true;
  } catch {
    return false;
  }
}
