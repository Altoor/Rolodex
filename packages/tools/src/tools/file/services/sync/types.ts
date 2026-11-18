import type { FileEntryRow } from "../entry";
import type { ManifestEntry } from "../manifest";
import type { FileTypeKind } from "../type";

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

/** Options after defaults have been applied. */
export interface SyncOptions {
  apply: boolean;
  includeUnchanged: boolean;
  hashMode: HashMode;
  detectMoves: boolean;
  maxEntries: number;
  maxHashBytes: number;
  rootPath: string;
}

export interface InBoth {
  entry: ManifestEntry;
  row: FileEntryRow;
}

export interface KindChange {
  entry: ManifestEntry;
  row: FileEntryRow;
}

export interface DiskEntryMeta {
  entry: ManifestEntry;
  contentHash: string | null;
  fileType: FileTypeKind | null;
  mimeType: string | null;
  lastEditedAt: Date;
}

export interface FileMove {
  row: FileEntryRow;
  entry: ManifestEntry;
}

export interface FolderMove {
  row: FileEntryRow;
  entry: ManifestEntry;
}
