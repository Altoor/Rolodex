import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  FilesystemError,
  TEMP_DIR_NAME,
  assertRealPathInsideRoot,
  basename,
  isIgnoredName,
  joinRelativePath,
  normalizeRelativePath,
  parentRelativePath,
  resolveFilesPath,
  stripControlCharacters,
  toRelativePath,
  validateEntryName,
} from "./paths";

export interface EntryStat {
  relativePath: string;
  absolutePath: string;
  name: string;
  kind: "file" | "folder";
  size: number | null;
  mtimeMs: number;
  mtime: Date;
  isSymlink: boolean;
}

export interface WriteTextOptions {
  /** Allow replacing an existing file. Defaults to false. */
  overwrite?: boolean;
  encoding?: BufferEncoding;
  /** Create the parent directory if it does not exist. Defaults to false. */
  createParent?: boolean;
}

/** Returns metadata for a path, or null when it does not exist. */
export async function statEntry(
  relativePath: string,
): Promise<EntryStat | null> {
  const absolutePath = resolveFilesPath(relativePath);

  try {
    const stat = await fs.lstat(absolutePath);
    return {
      relativePath: toRelativePath(absolutePath),
      absolutePath,
      name: path.basename(absolutePath),
      kind: stat.isDirectory() ? "folder" : "file",
      size: stat.isFile() ? stat.size : null,
      mtimeMs: stat.mtimeMs,
      mtime: stat.mtime,
      isSymlink: stat.isSymbolicLink(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Returns true when a path exists (symlinks count as existing). */
export async function pathExists(relativePath: string): Promise<boolean> {
  return (await statEntry(relativePath)) !== null;
}

/**
 * Lists the direct children of a folder. Symlinks and ignored system entries
 * are skipped, and results are sorted by name (folders first is a UI concern).
 */
export async function listDirectory(
  relativePath: string,
): Promise<EntryStat[]> {
  const absolutePath = resolveFilesPath(relativePath);
  await assertRealPathInsideRoot(absolutePath);

  const stat = await fs.lstat(absolutePath).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  });

  if (!stat) throw new FilesystemError(`folder "${relativePath}" not found`);
  if (!stat.isDirectory()) {
    throw new FilesystemError(`"${relativePath}" is not a folder`);
  }

  const entries: EntryStat[] = [];
  const directory = await fs.opendir(absolutePath);

  for await (const dirent of directory) {
    if (dirent.isSymbolicLink() || isIgnoredName(dirent.name)) continue;

    const childPath = joinRelativePath(
      normalizeRelativePath(relativePath, { allowRoot: true }),
      dirent.name,
    );
    const child = await statEntry(childPath);
    if (!child || child.isSymlink) continue;
    entries.push(child);
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  return entries;
}

/** Creates a folder. `recursive` defaults to false to avoid typo upgrades. */
export async function ensureDirectory(
  relativePath: string,
  options: { recursive?: boolean } = {},
): Promise<void> {
  const absolutePath = resolveFilesPath(relativePath);

  if (options.recursive) {
    await fs.mkdir(absolutePath, { recursive: true });
    await assertRealPathInsideRoot(absolutePath);
    return;
  }

  const parent = path.dirname(absolutePath);
  await assertRealPathInsideRoot(parent);
  await fs.mkdir(absolutePath);
}

/** Creates the staging directory used by uploads. */
export async function ensureTempDirectory(): Promise<string> {
  const relativePath = TEMP_DIR_NAME;
  await ensureDirectory(relativePath, { recursive: true });
  return relativePath;
}

/** Reads a UTF-8 text file with an optional byte limit. */
export async function readTextFile(
  relativePath: string,
  options: { maxBytes?: number } = {},
): Promise<string> {
  const stat = await statEntry(relativePath);
  if (!stat) throw new FilesystemError(`file "${relativePath}" not found`);
  if (stat.kind !== "file") {
    throw new FilesystemError(`"${relativePath}" is not a file`);
  }

  if (options.maxBytes !== undefined && (stat.size ?? 0) > options.maxBytes) {
    throw new FilesystemError(
      `file "${relativePath}" is ${stat.size} bytes; limit is ${options.maxBytes}`,
    );
  }

  await assertRealPathInsideRoot(stat.absolutePath);
  return fs.readFile(stat.absolutePath, "utf8");
}

/** Reads a file as a Buffer with an optional byte limit. */
export async function readFileBuffer(
  relativePath: string,
  options: { maxBytes?: number } = {},
): Promise<Buffer> {
  const stat = await statEntry(relativePath);
  if (!stat) throw new FilesystemError(`file "${relativePath}" not found`);
  if (stat.kind !== "file") {
    throw new FilesystemError(`"${relativePath}" is not a file`);
  }

  if (options.maxBytes !== undefined && (stat.size ?? 0) > options.maxBytes) {
    throw new FilesystemError(
      `file "${relativePath}" is ${stat.size} bytes; limit is ${options.maxBytes}`,
    );
  }

  await assertRealPathInsideRoot(stat.absolutePath);
  return fs.readFile(stat.absolutePath);
}

/**
 * Writes UTF-8 text atomically. A temp file is written in the same directory
 * and then renamed into place so readers never observe a partial file.
 */
export async function writeTextFile(
  relativePath: string,
  content: string,
  options: WriteTextOptions = {},
): Promise<EntryStat> {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = resolveFilesPath(normalized);
  const parent = path.dirname(absolutePath);

  if (options.createParent) {
    await fs.mkdir(parent, { recursive: true });
  }

  await assertRealPathInsideRoot(parent);

  const parentStat = await fs.stat(parent).catch(() => null);
  if (!parentStat || !parentStat.isDirectory()) {
    throw new FilesystemError(
      `parent folder "${parentRelativePath(normalized) || "/"}" not found`,
    );
  }

  if (!options.overwrite) {
    // Reserve the final name with an exclusive create. This turns a race into
    // a clear EEXIST instead of silently replacing another writer's file.
    const handle = await fs.open(absolutePath, "wx");
    await handle.close();
  }

  const tempPath = path.join(parent, `.tmp-${randomUUID()}`);

  try {
    await fs.writeFile(tempPath, content, {
      encoding: options.encoding ?? "utf8",
      flag: "wx",
    });
    await fs.rename(tempPath, absolutePath);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }

  const stat = await statEntry(normalized);
  if (!stat) throw new FilesystemError("file was written but is missing");
  return stat;
}

/** Writes a Buffer atomically (used by uploads). */
export async function writeFileBuffer(
  relativePath: string,
  content: Buffer,
  options: WriteTextOptions = {},
): Promise<EntryStat> {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = resolveFilesPath(normalized);
  const parent = path.dirname(absolutePath);

  if (options.createParent) {
    await fs.mkdir(parent, { recursive: true });
  }

  await assertRealPathInsideRoot(parent);

  if (!options.overwrite) {
    const handle = await fs.open(absolutePath, "wx");
    await handle.close();
  }

  const tempPath = path.join(parent, `.tmp-${randomUUID()}`);

  try {
    await fs.writeFile(tempPath, content, { flag: "wx" });
    await fs.rename(tempPath, absolutePath);
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }

  const stat = await statEntry(normalized);
  if (!stat) throw new FilesystemError("file was written but is missing");
  return stat;
}

/** Renames/moves an entry, falling back to copy+unlink across devices. */
export async function moveEntry(
  fromRelativePath: string,
  toRelativePath: string,
): Promise<void> {
  const from = resolveFilesPath(fromRelativePath);
  const to = resolveFilesPath(toRelativePath);

  await assertRealPathInsideRoot(from);
  await assertRealPathInsideRoot(path.dirname(to));

  const destination = await fs.lstat(to).catch(() => null);
  if (destination) {
    throw new FilesystemError(`"${toRelativePath}" already exists`);
  }

  try {
    await fs.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;

    await fs.cp(from, to, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await fs.rm(from, { recursive: true, force: true });
  }
}

/**
 * Deletes a file or folder. Non-empty folders require recursive: true so an
 * accidental click cannot remove a whole subtree.
 */
export async function deleteEntry(
  relativePath: string,
  options: { recursive?: boolean } = {},
): Promise<void> {
  const stat = await statEntry(relativePath);
  if (!stat) throw new FilesystemError(`"${relativePath}" not found`);

  if (stat.kind === "folder") {
    if (options.recursive) {
      await fs.rm(stat.absolutePath, { recursive: true, force: false });
    } else {
      await fs.rmdir(stat.absolutePath);
    }
    return;
  }

  await fs.unlink(stat.absolutePath);
}

/** Strips directory components and unsafe characters from an upload name. */
export function sanitizeUploadName(name: string): string {
  const base = basename(
    normalizeRelativePath(name.replace(/\\/g, "/").split("/").pop() ?? ""),
  );

  const sanitized = stripControlCharacters(base).replace(/[\\/]/g, "-").trim();

  return validateEntryName(sanitized);
}

/**
 * Returns a free name inside a folder, appending ` (1)`, ` (2)`, ... on
 * collisions while preserving the extension.
 */
export async function resolveUniqueName(
  parentFolder: string,
  desiredName: string,
): Promise<string> {
  const name = validateEntryName(desiredName);
  const parent = parentFolder ? normalizeRelativePath(parentFolder) : "";

  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const candidate = attempt === 0 ? name : appendCounter(name, attempt);
    const relativePath = parent ? `${parent}/${candidate}` : candidate;

    if (!(await pathExists(relativePath))) return candidate;
  }

  throw new FilesystemError(`could not find a free name for "${desiredName}"`);
}

function appendCounter(name: string, counter: number): string {
  const extensionIndex = name.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const stem = hasExtension ? name.slice(0, extensionIndex) : name;
  const extension = hasExtension ? name.slice(extensionIndex) : "";
  return `${stem} (${counter})${extension}`;
}
