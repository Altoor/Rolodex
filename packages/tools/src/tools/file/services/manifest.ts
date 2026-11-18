import fs from "node:fs/promises";
import path from "node:path";
import {
  FilesystemError,
  ensureFilesRoot,
  isIgnoredName,
  normalizeRelativePath,
  parentRelativePath,
  resolveFilesPath,
} from "./paths";

export interface ManifestEntry {
  relativePath: string;
  parentPath: string;
  name: string;
  kind: "file" | "folder";
  size: number | null;
  mtimeMs: number;
  mtime: Date;
}

export interface BuildManifestOptions {
  /** Optional subtree relative to FILES_ROOT. Defaults to the whole root. */
  path?: string;
  /** Abort above this many entries. Defaults to 5,000. */
  maxEntries?: number;
}

export interface ManifestResult {
  /** Normalized subtree path ("" for the whole root). */
  rootPath: string;
  entries: ManifestEntry[];
  warnings: string[];
}

export const DEFAULT_MAX_ENTRIES = 5_000;

/**
 * Walks the physical tree and returns a deterministic manifest. Symlinks and
 * ignored system entries are skipped; folders are ordered before their
 * children so callers can resolve parent rows in a single pass.
 */
export async function buildManifest(
  options: BuildManifestOptions = {},
): Promise<ManifestResult> {
  await ensureFilesRoot();

  const rootPath = options.path ? normalizeRelativePath(options.path) : "";
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const warnings: string[] = [];
  const entries: ManifestEntry[] = [];

  const absoluteRoot = resolveFilesPath(rootPath);
  const rootStat = await fs.lstat(absoluteRoot).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  });

  if (!rootStat) {
    throw new FilesystemError(
      rootPath ? `path "${rootPath}" not found` : "files root not found",
    );
  }

  if (!rootStat.isDirectory()) {
    throw new FilesystemError(`"${rootPath || "/"}" is not a folder`);
  }

  if (rootStat.isSymbolicLink()) {
    throw new FilesystemError("refusing to scan a symlinked root");
  }

  if (rootPath) {
    entries.push(toManifestEntry(rootPath, rootStat));
  }

  await walk(rootPath, absoluteRoot);

  entries.sort((left, right) => {
    const depth = depthOf(left.relativePath) - depthOf(right.relativePath);
    if (depth !== 0) return depth;
    return left.relativePath.localeCompare(right.relativePath);
  });

  return { rootPath, entries, warnings };

  async function walk(
    folderRelativePath: string,
    absoluteFolderPath: string,
  ): Promise<void> {
    let directory;
    try {
      directory = await fs.opendir(absoluteFolderPath);
    } catch (err) {
      warnings.push(
        `Could not read "${folderRelativePath || "/"}": ${errorMessage(err)}`,
      );
      return;
    }

    for await (const dirent of directory) {
      if (dirent.isSymbolicLink() || dirent.name.includes("\u0000")) {
        warnings.push(
          `Skipped symlink or invalid entry "${joinPath(folderRelativePath, dirent.name)}"`,
        );
        continue;
      }

      if (isIgnoredName(dirent.name)) continue;

      const childRelativePath = joinPath(folderRelativePath, dirent.name);
      const childAbsolutePath = path.join(absoluteFolderPath, dirent.name);

      let stat;
      try {
        stat = await fs.lstat(childAbsolutePath);
      } catch (err) {
        warnings.push(
          `Could not stat "${childRelativePath}": ${errorMessage(err)}`,
        );
        continue;
      }

      if (stat.isSymbolicLink()) {
        warnings.push(`Skipped symlink "${childRelativePath}"`);
        continue;
      }

      entries.push(toManifestEntry(childRelativePath, stat));

      if (entries.length > maxEntries) {
        throw new FilesystemError(
          `scan exceeded the maximum of ${maxEntries} entries; scan a smaller path or raise maxEntries`,
        );
      }

      if (stat.isDirectory()) {
        await walk(childRelativePath, childAbsolutePath);
      }
    }
  }
}

function toManifestEntry(
  relativePath: string,
  stat: {
    size: number | bigint;
    mtimeMs: number | bigint;
    mtime: Date;
    isDirectory(): boolean;
    isFile(): boolean;
  },
): ManifestEntry {
  return {
    relativePath,
    parentPath: parentRelativePath(relativePath),
    name: path.posix.basename(relativePath),
    kind: stat.isDirectory() ? "folder" : "file",
    size: stat.isFile() ? Number(stat.size) : null,
    mtimeMs: Number(stat.mtimeMs),
    mtime: stat.mtime,
  };
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function depthOf(relativePath: string): number {
  return relativePath.split("/").length;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
