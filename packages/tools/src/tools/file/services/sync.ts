import { eq, isNull } from "drizzle-orm";
import { db, fileEntries } from "@repo/db";
import {
  getFileEntryByPath,
  insertFileEntry,
  saveFileEntryWithEmbedding,
  softDeleteFileEntryRow,
  updateFileEntryRow,
  type FileEntryRow,
  type NewFileEntryRow,
} from "./entry";
import { folderContentHash, hashFile } from "./hash";
import {
  DEFAULT_MAX_ENTRIES,
  buildManifest,
  type ManifestEntry,
} from "./manifest";
import { normalizeRelativePath, parentRelativePath } from "./paths";
import {
  detectFileType,
  detectFileTypeFromName,
  type DetectedFileType,
  type FileTypeKind,
} from "./type";

export type HashMode = "auto" | "always" | "never";

export interface SyncFileTreeOptions {
  /** Optional subtree relative to FILES_ROOT. Defaults to the whole root. */
  path?: string;
  /** Persist changes to the database. Defaults to true. */
  apply?: boolean;
  /** Include unchanged entries in the report list. Defaults to false. */
  includeUnchanged?: boolean;
  /** When to compute SHA-256. Defaults to "auto". */
  hash?: HashMode;
  /** Detect moves by content hash. Defaults to true. */
  detectMoves?: boolean;
  /** Abort above this many disk entries. Defaults to 5,000. */
  maxEntries?: number;
  /** Files larger than this are trusted by size/mtime in auto mode. */
  maxHashBytes?: number;
}

export interface ScanCounts {
  added: number;
  changed: number;
  moved: number;
  deleted: number;
  unchanged: number;
}

export interface ScanEntry {
  kind: "file" | "folder";
  change: "added" | "changed" | "moved" | "deleted" | "unchanged";
  id: number | null;
  name: string;
  path: string;
  fromPath?: string;
  fileType?: string | null;
  mimeType?: string | null;
  size?: number | null;
  lastEditedAt?: string | null;
  filesystemModifiedAt?: string | null;
  contentHash?: string | null;
}

export interface ScanReport {
  counts: ScanCounts;
  entries: ScanEntry[];
  warnings: string[];
}

const DEFAULT_MAX_HASH_BYTES = 100 * 1024 * 1024;

interface InBoth {
  entry: ManifestEntry;
  row: FileEntryRow;
}

interface KindChange {
  entry: ManifestEntry;
  row: FileEntryRow;
}

interface DiskEntryMeta {
  entry: ManifestEntry;
  contentHash: string | null;
  fileType: FileTypeKind | null;
  mimeType: string | null;
  lastEditedAt: Date;
}

interface FileMove {
  row: FileEntryRow;
  entry: ManifestEntry;
}

interface FolderMove {
  row: FileEntryRow;
  entry: ManifestEntry;
}

/**
 * Reconciles the physical tree with `fileEntries`.
 *
 * The algorithm walks disk, diffs by path, uses size+mtime as a prefilter
 * before hashing, derives folder hashes from direct children, matches
 * moved files/folders by content hash, and finally applies updates, inserts,
 * subtype moves and soft deletes in depth order so parents always exist before
 * children.
 */
export async function syncFileTree(
  options: SyncFileTreeOptions = {},
): Promise<ScanReport> {
  const apply = options.apply ?? true;
  const includeUnchanged = options.includeUnchanged ?? false;
  const hashMode = options.hash ?? "auto";
  const detectMoves = options.detectMoves ?? true;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxHashBytes = options.maxHashBytes ?? DEFAULT_MAX_HASH_BYTES;
  const rootPath = options.path ? normalizeRelativePath(options.path) : "";

  const manifest = await buildManifest({ path: rootPath, maxEntries });
  const warnings = [...manifest.warnings];

  const manifestByPath = new Map(
    manifest.entries.map((entry) => [entry.relativePath, entry]),
  );
  const snapshotRows = await loadLiveEntries(manifest.rootPath);
  const dbByPath = new Map(snapshotRows.map((row) => [row.relativePath, row]));
  const idByPath = new Map(
    snapshotRows.map((row) => [row.relativePath, row.id]),
  );

  // -------------------------------------------------------------------------
  // Classify disk paths against the DB snapshot.
  // -------------------------------------------------------------------------

  const inBoth: InBoth[] = [];
  const diskOnly: ManifestEntry[] = [];
  const kindChanges: KindChange[] = [];
  const dbOnly: FileEntryRow[] = [];

  for (const entry of manifest.entries) {
    const row = dbByPath.get(entry.relativePath);
    if (!row) {
      diskOnly.push(entry);
      continue;
    }
    if (row.kind !== entry.kind) {
      kindChanges.push({ entry, row });
      continue;
    }
    inBoth.push({ entry, row });
  }

  for (const row of snapshotRows) {
    if (!manifestByPath.has(row.relativePath)) dbOnly.push(row);
  }

  const inBothByPath = new Map(
    inBoth.map((item) => [item.entry.relativePath, item]),
  );
  const kindChangeByPath = new Map(
    kindChanges.map((item) => [item.entry.relativePath, item]),
  );

  // -------------------------------------------------------------------------
  // Hash files. New files and changed files are hashed (subject to limits);
  // unchanged files trust their stored hash.
  // -------------------------------------------------------------------------

  const fileHashes = new Map<string, string>();
  const staleHashPaths = new Set<string>();

  for (const entry of manifest.entries) {
    if (entry.kind !== "file") continue;

    const existing = inBothByPath.get(entry.relativePath)?.row;
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
        staleHashPaths.add(entry.relativePath);
      }
      continue;
    }

    try {
      fileHashes.set(entry.relativePath, await hashFile(entry.relativePath));
    } catch (err) {
      warnings.push(
        `Could not hash "${entry.relativePath}": ${errorMessage(err)}`,
      );
      if (existing && !statUnchanged(existing, entry)) {
        staleHashPaths.add(entry.relativePath);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Folder hashes from direct children, deepest first.
  // -------------------------------------------------------------------------

  const childrenByParent = new Map<string, ManifestEntry[]>();
  for (const entry of manifest.entries) {
    const children = childrenByParent.get(entry.parentPath);
    if (children) children.push(entry);
    else childrenByParent.set(entry.parentPath, [entry]);
  }

  const folderHashes = new Map<string, string>();

  const foldersDeepestFirst = manifest.entries
    .filter((entry) => entry.kind === "folder")
    .sort(
      (left, right) => depthOf(right.relativePath) - depthOf(left.relativePath),
    );

  for (const folder of foldersDeepestFirst) {
    const children = childrenByParent.get(folder.relativePath) ?? [];
    const hash = folderContentHash(
      children.map((child) => ({
        name: child.name,
        kind: child.kind,
        contentHash: currentHashFor(child.relativePath),
      })),
    );
    folderHashes.set(folder.relativePath, hash);
  }

  function currentHashFor(relativePath: string): string | null {
    const computedFileHash = fileHashes.get(relativePath);
    if (computedFileHash !== undefined) return computedFileHash;

    const computedFolderHash = folderHashes.get(relativePath);
    if (computedFolderHash !== undefined) return computedFolderHash;

    if (staleHashPaths.has(relativePath)) return null;

    const row = dbByPath.get(relativePath);
    const diskEntry = manifestByPath.get(relativePath);
    if (row && diskEntry && row.kind !== diskEntry.kind) return null;

    return row?.contentHash ?? null;
  }

  // -------------------------------------------------------------------------
  // File types and last-edited timestamps.
  // -------------------------------------------------------------------------

  const typeByPath = new Map<string, DetectedFileType>();

  for (const entry of manifest.entries) {
    if (entry.kind !== "file") continue;

    const byName = detectFileTypeFromName(entry.name);
    try {
      typeByPath.set(
        entry.relativePath,
        byName.confidence === "high"
          ? byName
          : await detectFileType(entry.relativePath),
      );
    } catch (err) {
      warnings.push(
        `Could not detect type for "${entry.relativePath}": ${errorMessage(err)}`,
      );
      typeByPath.set(entry.relativePath, byName);
    }
  }

  const lastEditedByPath = new Map<string, Date>();

  for (const entry of manifest.entries) {
    if (entry.kind !== "file") continue;
    const existing = inBothByPath.get(entry.relativePath)?.row;
    lastEditedByPath.set(
      entry.relativePath,
      latestDate(existing?.lastEditedAt ?? entry.mtime, entry.mtime),
    );
  }

  for (const folder of foldersDeepestFirst) {
    const existing = inBothByPath.get(folder.relativePath)?.row;
    let latest = latestDate(
      existing?.lastEditedAt ?? folder.mtime,
      folder.mtime,
    );
    for (const child of childrenByParent.get(folder.relativePath) ?? []) {
      latest = latestDate(
        latest,
        lastEditedByPath.get(child.relativePath) ?? child.mtime,
      );
    }
    lastEditedByPath.set(folder.relativePath, latest);
  }

  function metaFor(entry: ManifestEntry): DiskEntryMeta {
    const existing = inBothByPath.get(entry.relativePath)?.row;
    const detected =
      entry.kind === "file" ? typeByPath.get(entry.relativePath) : undefined;

    let contentHash: string | null = null;
    if (entry.kind === "folder") {
      contentHash = folderHashes.get(entry.relativePath) ?? null;
    } else {
      const computed = fileHashes.get(entry.relativePath);
      if (computed !== undefined) {
        contentHash = computed;
      } else if (!staleHashPaths.has(entry.relativePath)) {
        contentHash = existing?.contentHash ?? null;
      }
    }

    return {
      entry,
      contentHash,
      fileType: entry.kind === "file" ? (detected?.fileType ?? null) : null,
      mimeType: entry.kind === "file" ? (detected?.mimeType ?? null) : null,
      lastEditedAt: lastEditedByPath.get(entry.relativePath) ?? entry.mtime,
    };
  }

  // -------------------------------------------------------------------------
  // Move detection. Folder moves are matched first so their whole subtree is
  // handled once; file moves are then matched among the remaining candidates.
  // -------------------------------------------------------------------------

  const handledDiskPaths = new Set<string>();
  const movedDbRowIds = new Set<number>();
  const folderMoves: FolderMove[] = [];
  const fileMoves: FileMove[] = [];

  if (detectMoves) {
    const removedFolders = dbOnly.filter(
      (row) => row.kind === "folder" && row.contentHash !== null,
    );
    const addedFolders = diskOnly.filter(
      (entry) =>
        entry.kind === "folder" && folderHashes.has(entry.relativePath),
    );

    const folderCandidates = new Map<string, FileEntryRow[]>();
    for (const row of removedFolders) {
      const key = row.contentHash as string;
      const list = folderCandidates.get(key);
      if (list) list.push(row);
      else folderCandidates.set(key, [row]);
    }

    const sortedAddedFolders = [...addedFolders].sort(
      (left, right) => depthOf(left.relativePath) - depthOf(right.relativePath),
    );

    for (const entry of sortedAddedFolders) {
      if (handledDiskPaths.has(entry.relativePath)) continue;

      const hash = folderHashes.get(entry.relativePath);
      const candidates = (
        (hash ? folderCandidates.get(hash) : undefined) ?? []
      ).filter((row) => !movedDbRowIds.has(row.id));

      if (candidates.length === 0) continue;

      const row = pickBestMove(candidates, entry);
      folderMoves.push({ row, entry });

      for (const candidate of dbOnly) {
        if (isSameOrUnder(candidate.relativePath, row.relativePath)) {
          movedDbRowIds.add(candidate.id);
        }
      }

      for (const diskEntry of diskOnly) {
        if (isSameOrUnder(diskEntry.relativePath, entry.relativePath)) {
          handledDiskPaths.add(diskEntry.relativePath);
        }
      }
    }

    const removedFiles = dbOnly.filter(
      (row) =>
        row.kind === "file" &&
        row.contentHash !== null &&
        !movedDbRowIds.has(row.id),
    );
    const addedFiles = diskOnly.filter(
      (entry) =>
        entry.kind === "file" &&
        !handledDiskPaths.has(entry.relativePath) &&
        fileHashes.has(entry.relativePath),
    );

    const fileCandidates = new Map<string, FileEntryRow[]>();
    for (const row of removedFiles) {
      const key = `${row.contentHash}:${row.size ?? ""}`;
      const list = fileCandidates.get(key);
      if (list) list.push(row);
      else fileCandidates.set(key, [row]);
    }

    for (const entry of addedFiles) {
      const hash = fileHashes.get(entry.relativePath) as string;
      const key = `${hash}:${entry.size ?? ""}`;
      const candidates = fileCandidates.get(key);
      if (!candidates || candidates.length === 0) continue;

      const row = pickBestMove(candidates, entry);
      fileMoves.push({ row, entry });
      movedDbRowIds.add(row.id);

      const index = candidates.indexOf(row);
      if (index !== -1) candidates.splice(index, 1);
    }
  }

  const folderMoveByPath = new Map(
    folderMoves.map((move) => [move.entry.relativePath, move]),
  );
  const fileMoveByPath = new Map(
    fileMoves.map((move) => [move.entry.relativePath, move]),
  );

  // -------------------------------------------------------------------------
  // Apply in depth order so a child's parent row always exists first.
  // -------------------------------------------------------------------------

  const report: ScanReport = {
    counts: { added: 0, changed: 0, moved: 0, deleted: 0, unchanged: 0 },
    entries: [],
    warnings,
  };

  for (const entry of manifest.entries) {
    const folderMove = folderMoveByPath.get(entry.relativePath);
    if (folderMove) {
      await applyFolderMove(folderMove);
      continue;
    }

    if (handledDiskPaths.has(entry.relativePath)) continue;

    const fileMove = fileMoveByPath.get(entry.relativePath);
    if (fileMove) {
      await applyFileMove(fileMove);
      continue;
    }

    const kindChange = kindChangeByPath.get(entry.relativePath);
    if (kindChange) {
      await applyKindChange(kindChange);
      continue;
    }

    const existing = inBothByPath.get(entry.relativePath);
    if (existing) {
      await applyInBoth(existing);
      continue;
    }

    await applyAdded(entry);
  }

  const deletedRows = dbOnly
    .filter((row) => !movedDbRowIds.has(row.id))
    .sort(
      (left, right) => depthOf(right.relativePath) - depthOf(left.relativePath),
    );

  for (const row of deletedRows) {
    try {
      if (apply) await softDeleteFileEntryRow(row.id);
      pushEntry(scanEntryFromRow("deleted", row));
    } catch (err) {
      warnings.push(
        `Could not delete "${row.relativePath}": ${errorMessage(err)}`,
      );
    }
  }

  return report;

  // -------------------------------------------------------------------------
  // Apply helpers
  // -------------------------------------------------------------------------

  async function applyInBoth(item: InBoth): Promise<void> {
    const { entry, row } = item;
    const meta = metaFor(entry);
    const change = changeStatusFor(entry, row);

    try {
      if (apply) {
        const values = metadataValues(meta);
        if (metadataDiffers(row, values)) {
          await updateFileEntryRow(row.id, values);
        }
      }
      pushEntry(scanEntryFromMeta(change, meta, row.id));
    } catch (err) {
      warnings.push(
        `Could not update "${entry.relativePath}": ${errorMessage(err)}`,
      );
    }
  }

  async function applyKindChange(item: KindChange): Promise<void> {
    const { entry, row } = item;
    const meta = metaFor(entry);
    let newId: number | null = null;

    try {
      if (apply) {
        await softDeleteFileEntryRow(row.id);
        const parentId = await resolveParentId(entry.parentPath);
        const inserted = await insertFileEntry({
          kind: entry.kind,
          name: entry.name,
          relativePath: entry.relativePath,
          parentId,
          description: row.description,
          ...metadataValues(meta),
        });
        idByPath.set(entry.relativePath, inserted.id);
        newId = inserted.id;
        await saveFileEntryWithEmbedding(inserted);
      }
      // A kind change is reported as a change, not a delete + add.
      pushEntry(scanEntryFromMeta("changed", meta, newId));
    } catch (err) {
      warnings.push(
        `Could not replace "${entry.relativePath}": ${errorMessage(err)}`,
      );
    }
  }

  async function applyAdded(entry: ManifestEntry): Promise<void> {
    const meta = metaFor(entry);
    let newId: number | null = null;

    try {
      if (apply) {
        const parentId = await resolveParentId(entry.parentPath);
        const inserted = await insertFileEntry({
          kind: entry.kind,
          name: entry.name,
          relativePath: entry.relativePath,
          parentId,
          description: "",
          ...metadataValues(meta),
        });
        idByPath.set(entry.relativePath, inserted.id);
        newId = inserted.id;
        await saveFileEntryWithEmbedding(inserted);
      }
      pushEntry(scanEntryFromMeta("added", meta, newId));
    } catch (err) {
      warnings.push(
        `Could not add "${entry.relativePath}": ${errorMessage(err)}`,
      );
    }
  }

  async function applyFileMove(move: FileMove): Promise<void> {
    const { row, entry } = move;
    const meta = metaFor(entry);
    const fromPath = row.relativePath;

    try {
      if (apply) {
        const parentId = await resolveParentId(entry.parentPath);
        const updated = await updateFileEntryRow(row.id, {
          relativePath: entry.relativePath,
          parentId,
          name: entry.name,
          ...metadataValues(meta),
          lastEditedAt: latestDate(row.lastEditedAt, meta.lastEditedAt),
        });
        idByPath.delete(fromPath);
        idByPath.set(entry.relativePath, updated.id);
        await saveFileEntryWithEmbedding(updated);
      }
      pushEntry(scanEntryFromMeta("moved", meta, row.id, fromPath));
    } catch (err) {
      warnings.push(
        `Could not move "${fromPath}" to "${entry.relativePath}": ${errorMessage(err)}`,
      );
    }
  }

  async function applyFolderMove(move: FolderMove): Promise<void> {
    const { row, entry } = move;
    const fromPath = row.relativePath;
    const toPath = entry.relativePath;
    const meta = metaFor(entry);

    try {
      if (apply) {
        const newParentId = await resolveParentId(entry.parentPath);
        const subtree = snapshotRows
          .filter((candidate) =>
            isSameOrUnder(candidate.relativePath, fromPath),
          )
          .sort(
            (left, right) =>
              depthOf(left.relativePath) - depthOf(right.relativePath),
          );

        const updatedRows = await db.transaction(async (tx) => {
          const result: FileEntryRow[] = [];

          for (const subtreeRow of subtree) {
            const newPath =
              toPath + subtreeRow.relativePath.slice(fromPath.length);
            const diskEntry = manifestByPath.get(newPath);
            const diskMeta = diskEntry ? metaFor(diskEntry) : null;

            const values: Partial<NewFileEntryRow> = {
              relativePath: newPath,
              updatedAt: new Date(),
            };

            if (diskMeta) {
              Object.assign(values, metadataValues(diskMeta));
              values.lastEditedAt = latestDate(
                subtreeRow.lastEditedAt,
                diskMeta.lastEditedAt,
              );
            }

            if (subtreeRow.id === row.id) {
              values.name = entry.name;
              values.parentId = newParentId;
            }

            const [updated] = await tx
              .update(fileEntries)
              .set(values)
              .where(eq(fileEntries.id, subtreeRow.id))
              .returning();

            if (updated) result.push(updated);
          }

          return result;
        });

        for (const subtreeRow of subtree) {
          idByPath.delete(subtreeRow.relativePath);
        }
        for (const updated of updatedRows) {
          idByPath.set(updated.relativePath, updated.id);
          await saveFileEntryWithEmbedding(updated);
        }
      }

      pushEntry(scanEntryFromMeta("moved", meta, row.id, fromPath));
    } catch (err) {
      warnings.push(
        `Could not move folder "${fromPath}" to "${toPath}": ${errorMessage(err)}`,
      );
    }
  }

  function pushEntry(entry: ScanEntry): void {
    report.counts[entry.change] += 1;
    if (entry.change !== "unchanged" || includeUnchanged) {
      report.entries.push(entry);
    }
  }

  function changeStatusFor(
    entry: ManifestEntry,
    row: FileEntryRow,
  ): "changed" | "unchanged" {
    if (entry.kind === "file") {
      const computed = fileHashes.get(entry.relativePath);
      if (computed !== undefined) {
        if (row.contentHash == null) {
          return statUnchanged(row, entry) ? "unchanged" : "changed";
        }
        return computed === row.contentHash ? "unchanged" : "changed";
      }
      if (staleHashPaths.has(entry.relativePath)) return "changed";
      return "unchanged";
    }

    const computed = folderHashes.get(entry.relativePath);
    if (
      computed !== undefined &&
      row.contentHash != null &&
      computed !== row.contentHash
    ) {
      return "changed";
    }
    return "unchanged";
  }

  async function resolveParentId(folderPath: string): Promise<number | null> {
    if (!folderPath) return null;

    const existing = idByPath.get(folderPath);
    if (existing !== undefined) return existing;

    const row = await getFileEntryByPath(folderPath);
    if (row) {
      idByPath.set(folderPath, row.id);
      return row.id;
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

async function loadLiveEntries(rootPath: string): Promise<FileEntryRow[]> {
  const rows = await db
    .select()
    .from(fileEntries)
    .where(isNull(fileEntries.deletedAt));

  if (!rootPath) return rows;

  return rows.filter(
    (row) =>
      row.relativePath === rootPath ||
      row.relativePath.startsWith(`${rootPath}/`),
  );
}

function statUnchanged(row: FileEntryRow, entry: ManifestEntry): boolean {
  return (
    row.size === entry.size &&
    row.filesystemModifiedAt !== null &&
    row.filesystemModifiedAt.getTime() === Math.trunc(entry.mtimeMs)
  );
}

function metadataValues(meta: DiskEntryMeta): {
  size: number | null;
  fileType: FileTypeKind | null;
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

function metadataDiffers(
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

function scanEntryFromMeta(
  change: ScanEntry["change"],
  meta: DiskEntryMeta,
  id: number | null,
  fromPath?: string,
): ScanEntry {
  return {
    kind: meta.entry.kind,
    change,
    id,
    name: meta.entry.name,
    path: meta.entry.relativePath,
    ...(fromPath !== undefined ? { fromPath } : {}),
    fileType: meta.fileType,
    mimeType: meta.mimeType,
    size: meta.entry.size,
    lastEditedAt: meta.lastEditedAt.toISOString(),
    filesystemModifiedAt: meta.entry.mtime.toISOString(),
    contentHash: meta.contentHash,
  };
}

function scanEntryFromRow(
  change: ScanEntry["change"],
  row: FileEntryRow,
): ScanEntry {
  return {
    kind: row.kind,
    change,
    id: row.id,
    name: row.name,
    path: row.relativePath,
    fileType: row.fileType,
    mimeType: row.mimeType,
    size: row.size,
    lastEditedAt: row.lastEditedAt.toISOString(),
    filesystemModifiedAt: row.filesystemModifiedAt?.toISOString() ?? null,
    contentHash: row.contentHash,
  };
}

function pickBestMove(
  candidates: FileEntryRow[],
  entry: ManifestEntry,
): FileEntryRow {
  let best = candidates[0] as FileEntryRow;
  let bestScore = scoreMove(best, entry);

  for (const candidate of candidates.slice(1)) {
    const score = scoreMove(candidate, entry);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function scoreMove(row: FileEntryRow, entry: ManifestEntry): number {
  const sameName = row.name === entry.name ? 100 : 0;
  const sameParent =
    parentRelativePath(row.relativePath) === entry.parentPath ? 10 : 0;
  const commonSegments = commonPrefixSegments(
    parentRelativePath(row.relativePath),
    entry.parentPath,
  );
  return sameName + sameParent + commonSegments;
}

function commonPrefixSegments(left: string, right: string): number {
  const leftSegments = left ? left.split("/") : [];
  const rightSegments = right ? right.split("/") : [];
  const limit = Math.min(leftSegments.length, rightSegments.length);

  let count = 0;
  while (count < limit && leftSegments[count] === rightSegments[count]) {
    count += 1;
  }

  return count;
}

function isSameOrUnder(relativePath: string, prefix: string): boolean {
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

function latestDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function depthOf(relativePath: string): number {
  return relativePath.split("/").length;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
