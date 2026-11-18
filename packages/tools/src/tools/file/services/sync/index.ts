import { applyChanges } from "./apply";
import { createSyncContext } from "./context";
import {
  computeLastEdited,
  detectTypes,
  hashFiles,
  hashFolders,
} from "./fingerprints";
import { detectMoves } from "./moves";
import type { ScanReport, SyncFileTreeOptions } from "./types";

/**
 * Reconciles the physical tree with `fileEntries`.
 *
 * The algorithm walks disk, diffs by path, uses size+mtime as a prefilter
 * before hashing, derives folder hashes from direct children, matches moved
 * files/folders by content hash, and finally applies updates, inserts,
 * subtype moves and soft deletes in depth order so parents always exist before
 * children.
 */
export async function syncFileTree(
  options: SyncFileTreeOptions = {},
): Promise<ScanReport> {
  const ctx = await createSyncContext(options);

  await hashFiles(ctx);
  hashFolders(ctx);
  await detectTypes(ctx);
  computeLastEdited(ctx);
  detectMoves(ctx);
  await applyChanges(ctx);

  return ctx.report;
}

export type {
  HashMode,
  ScanCounts,
  ScanEntry,
  ScanReport,
  SyncFileTreeOptions,
} from "./types";
