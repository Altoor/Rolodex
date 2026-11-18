import { isNull } from "drizzle-orm";
import { db, fileEntries } from "@repo/db";
import type { FileEntryRow } from "../entry";
import {
  DEFAULT_MAX_ENTRIES,
  buildManifest,
  type ManifestEntry,
  type ManifestResult,
} from "../manifest";
import { normalizeRelativePath } from "../paths";
import type { DetectedFileType } from "../type";
import type {
  FileMove,
  FolderMove,
  InBoth,
  KindChange,
  ScanReport,
  SyncFileTreeOptions,
  SyncOptions,
} from "./types";

const DEFAULT_MAX_HASH_BYTES = 100 * 1024 * 1024;

export interface SyncContext {
  options: SyncOptions;
  manifest: ManifestResult;
  manifestByPath: Map<string, ManifestEntry>;
  snapshotRows: FileEntryRow[];
  dbByPath: Map<string, FileEntryRow>;
  idByPath: Map<string, number>;

  diskOnly: ManifestEntry[];
  dbOnly: FileEntryRow[];
  inBothByPath: Map<string, InBoth>;
  kindChangeByPath: Map<string, KindChange>;

  fileHashes: Map<string, string>;
  staleHashPaths: Set<string>;
  childrenByParent: Map<string, ManifestEntry[]>;
  folderHashes: Map<string, string>;
  foldersDeepestFirst: ManifestEntry[];
  typeByPath: Map<string, DetectedFileType>;
  lastEditedByPath: Map<string, Date>;

  handledDiskPaths: Set<string>;
  movedDbRowIds: Set<number>;
  folderMoveByPath: Map<string, FolderMove>;
  fileMoveByPath: Map<string, FileMove>;

  report: ScanReport;
}

/**
 * Builds the immutable inputs and mutable work sets for one sync run: the disk
 * manifest, the live DB snapshot, and the path-level diff between them.
 */
export async function createSyncContext(
  options: SyncFileTreeOptions = {},
): Promise<SyncContext> {
  const resolved: SyncOptions = {
    apply: options.apply ?? true,
    includeUnchanged: options.includeUnchanged ?? false,
    hashMode: options.hash ?? "auto",
    detectMoves: options.detectMoves ?? true,
    maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxHashBytes: options.maxHashBytes ?? DEFAULT_MAX_HASH_BYTES,
    rootPath: options.path ? normalizeRelativePath(options.path) : "",
  };

  const manifest = await buildManifest({
    path: resolved.rootPath,
    maxEntries: resolved.maxEntries,
  });

  const manifestByPath = new Map(
    manifest.entries.map((entry) => [entry.relativePath, entry]),
  );
  const snapshotRows = await loadLiveEntries(manifest.rootPath);
  const dbByPath = new Map(snapshotRows.map((row) => [row.relativePath, row]));
  const idByPath = new Map(
    snapshotRows.map((row) => [row.relativePath, row.id]),
  );
  const { diskOnly, dbOnly, inBothByPath, kindChangeByPath } = classify(
    manifest.entries,
    snapshotRows,
    dbByPath,
    manifestByPath,
  );

  return {
    options: resolved,
    manifest,
    manifestByPath,
    snapshotRows,
    dbByPath,
    idByPath,
    diskOnly,
    dbOnly,
    inBothByPath,
    kindChangeByPath,
    fileHashes: new Map(),
    staleHashPaths: new Set(),
    childrenByParent: new Map(),
    folderHashes: new Map(),
    foldersDeepestFirst: [],
    typeByPath: new Map(),
    lastEditedByPath: new Map(),
    handledDiskPaths: new Set(),
    movedDbRowIds: new Set(),
    folderMoveByPath: new Map(),
    fileMoveByPath: new Map(),
    report: {
      counts: { added: 0, changed: 0, moved: 0, deleted: 0, unchanged: 0 },
      entries: [],
      warnings: [...manifest.warnings],
    },
  };
}

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

function classify(
  entries: ManifestEntry[],
  snapshotRows: FileEntryRow[],
  dbByPath: Map<string, FileEntryRow>,
  manifestByPath: Map<string, ManifestEntry>,
): {
  diskOnly: ManifestEntry[];
  dbOnly: FileEntryRow[];
  inBothByPath: Map<string, InBoth>;
  kindChangeByPath: Map<string, KindChange>;
} {
  const inBothByPath = new Map<string, InBoth>();
  const kindChangeByPath = new Map<string, KindChange>();
  const diskOnly: ManifestEntry[] = [];
  const dbOnly: FileEntryRow[] = [];

  for (const entry of entries) {
    const row = dbByPath.get(entry.relativePath);
    if (!row) {
      diskOnly.push(entry);
      continue;
    }
    if (row.kind !== entry.kind) {
      kindChangeByPath.set(entry.relativePath, { entry, row });
      continue;
    }
    inBothByPath.set(entry.relativePath, { entry, row });
  }

  for (const row of snapshotRows) {
    if (!manifestByPath.has(row.relativePath)) dbOnly.push(row);
  }

  return { diskOnly, dbOnly, inBothByPath, kindChangeByPath };
}
