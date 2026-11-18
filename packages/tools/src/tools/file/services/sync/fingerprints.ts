import type { FileEntryRow } from "../entry";
import { folderContentHash, hashFile } from "../hash";
import type { ManifestEntry } from "../manifest";
import { detectFileType, detectFileTypeFromName } from "../type";
import type { SyncContext } from "./context";
import { depthOf, errorMessage, latestDate, statUnchanged } from "./helpers";
import type { DiskEntryMeta } from "./types";

/** Hashes new and changed files, subject to the configured limits. */
export async function hashFiles(ctx: SyncContext): Promise<void> {
  const { hashMode, maxHashBytes } = ctx.options;

  for (const entry of ctx.manifest.entries) {
    if (entry.kind !== "file") continue;

    const existing = ctx.inBothByPath.get(entry.relativePath)?.row;
    const isNew = existing === undefined;
    const size = entry.size ?? 0;

    let shouldHash = false;
    if (hashMode === "always") {
      shouldHash = true;
    } else if (hashMode !== "never") {
      if (isNew || existing.contentHash == null) {
        shouldHash = size <= maxHashBytes;
      } else if (!statUnchanged(existing, entry)) {
        shouldHash = size <= maxHashBytes;
      }
    }

    if (!shouldHash) {
      if (existing && !statUnchanged(existing, entry)) {
        ctx.staleHashPaths.add(entry.relativePath);
      }
      continue;
    }

    try {
      ctx.fileHashes.set(
        entry.relativePath,
        await hashFile(entry.relativePath),
      );
    } catch (err) {
      ctx.report.warnings.push(
        `Could not hash "${entry.relativePath}": ${errorMessage(err)}`,
      );
      if (existing && !statUnchanged(existing, entry)) {
        ctx.staleHashPaths.add(entry.relativePath);
      }
    }
  }
}

/** Derives folder hashes from their direct children, deepest first. */
export function hashFolders(ctx: SyncContext): void {
  const childrenByParent = new Map<string, ManifestEntry[]>();
  for (const entry of ctx.manifest.entries) {
    const children = childrenByParent.get(entry.parentPath);
    if (children) children.push(entry);
    else childrenByParent.set(entry.parentPath, [entry]);
  }
  ctx.childrenByParent = childrenByParent;

  ctx.foldersDeepestFirst = ctx.manifest.entries
    .filter((entry) => entry.kind === "folder")
    .sort(
      (left, right) => depthOf(right.relativePath) - depthOf(left.relativePath),
    );

  for (const folder of ctx.foldersDeepestFirst) {
    const children = childrenByParent.get(folder.relativePath) ?? [];
    const hash = folderContentHash(
      children.map((child) => ({
        name: child.name,
        kind: child.kind,
        contentHash: currentHashFor(ctx, child.relativePath),
      })),
    );
    ctx.folderHashes.set(folder.relativePath, hash);
  }
}

function currentHashFor(ctx: SyncContext, relativePath: string): string | null {
  const computedFileHash = ctx.fileHashes.get(relativePath);
  if (computedFileHash !== undefined) return computedFileHash;

  const computedFolderHash = ctx.folderHashes.get(relativePath);
  if (computedFolderHash !== undefined) return computedFolderHash;

  if (ctx.staleHashPaths.has(relativePath)) return null;

  const row = ctx.dbByPath.get(relativePath);
  const diskEntry = ctx.manifestByPath.get(relativePath);
  if (row && diskEntry && row.kind !== diskEntry.kind) return null;

  return row?.contentHash ?? null;
}

/** Detects file types, reading magic bytes only when the name is ambiguous. */
export async function detectTypes(ctx: SyncContext): Promise<void> {
  for (const entry of ctx.manifest.entries) {
    if (entry.kind !== "file") continue;

    const byName = detectFileTypeFromName(entry.name);
    try {
      ctx.typeByPath.set(
        entry.relativePath,
        byName.confidence === "high"
          ? byName
          : await detectFileType(entry.relativePath),
      );
    } catch (err) {
      ctx.report.warnings.push(
        `Could not detect type for "${entry.relativePath}": ${errorMessage(err)}`,
      );
      ctx.typeByPath.set(entry.relativePath, byName);
    }
  }
}

/** Propagates the newest file timestamp up through folder ancestors. */
export function computeLastEdited(ctx: SyncContext): void {
  for (const entry of ctx.manifest.entries) {
    if (entry.kind !== "file") continue;
    const existing = ctx.inBothByPath.get(entry.relativePath)?.row;
    ctx.lastEditedByPath.set(
      entry.relativePath,
      latestDate(existing?.lastEditedAt ?? entry.mtime, entry.mtime),
    );
  }

  for (const folder of ctx.foldersDeepestFirst) {
    const existing = ctx.inBothByPath.get(folder.relativePath)?.row;
    let latest = latestDate(
      existing?.lastEditedAt ?? folder.mtime,
      folder.mtime,
    );
    for (const child of ctx.childrenByParent.get(folder.relativePath) ?? []) {
      latest = latestDate(
        latest,
        ctx.lastEditedByPath.get(child.relativePath) ?? child.mtime,
      );
    }
    ctx.lastEditedByPath.set(folder.relativePath, latest);
  }
}

export function metaFor(ctx: SyncContext, entry: ManifestEntry): DiskEntryMeta {
  const existing = ctx.inBothByPath.get(entry.relativePath)?.row;
  const detected =
    entry.kind === "file" ? ctx.typeByPath.get(entry.relativePath) : undefined;

  let contentHash: string | null = null;
  if (entry.kind === "folder") {
    contentHash = ctx.folderHashes.get(entry.relativePath) ?? null;
  } else {
    const computed = ctx.fileHashes.get(entry.relativePath);
    if (computed !== undefined) {
      contentHash = computed;
    } else if (!ctx.staleHashPaths.has(entry.relativePath)) {
      contentHash = existing?.contentHash ?? null;
    }
  }

  return {
    entry,
    contentHash,
    fileType: entry.kind === "file" ? (detected?.fileType ?? null) : null,
    mimeType: entry.kind === "file" ? (detected?.mimeType ?? null) : null,
    lastEditedAt: ctx.lastEditedByPath.get(entry.relativePath) ?? entry.mtime,
  };
}

export function metadataValues(meta: DiskEntryMeta): {
  size: number | null;
  fileType: DiskEntryMeta["fileType"];
  mimeType: string | null;
  contentHash: string | null;
  filesystemModifiedAt: Date;
  lastEditedAt: Date;
} {
  return {
    size: meta.entry.size,
    fileType: meta.fileType,
    mimeType: meta.mimeType,
    contentHash: meta.contentHash,
    filesystemModifiedAt: meta.entry.mtime,
    lastEditedAt: meta.lastEditedAt,
  };
}

export function metadataDiffers(
  row: FileEntryRow,
  values: ReturnType<typeof metadataValues>,
): boolean {
  return (
    row.size !== values.size ||
    row.fileType !== values.fileType ||
    row.mimeType !== values.mimeType ||
    row.contentHash !== values.contentHash ||
    (row.filesystemModifiedAt?.getTime() ?? null) !==
      values.filesystemModifiedAt.getTime() ||
    row.lastEditedAt.getTime() !== values.lastEditedAt.getTime()
  );
}
