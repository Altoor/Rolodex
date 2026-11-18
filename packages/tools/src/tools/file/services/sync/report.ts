import type { FileEntryRow } from "../entry";
import type { SyncContext } from "./context";
import type { DiskEntryMeta, ScanEntry } from "./types";

export function pushEntry(ctx: SyncContext, entry: ScanEntry): void {
  ctx.report.counts[entry.change] += 1;
  if (entry.change !== "unchanged" || ctx.options.includeUnchanged) {
    ctx.report.entries.push(entry);
  }
}

export function scanEntryFromMeta(
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

export function scanEntryFromRow(
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
