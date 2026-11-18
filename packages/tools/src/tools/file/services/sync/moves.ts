import type { SyncContext } from "./context";
import { depthOf, isSameOrUnder, pickBestMove } from "./helpers";
import type { FileMove, FolderMove } from "./types";

/**
 * Matches moved folders first so their whole subtree is handled once, then
 * matches moved files among the remaining candidates. Matches are only made
 * when the content hash and size agree.
 */
export function detectMoves(ctx: SyncContext): void {
  if (!ctx.options.detectMoves) return;

  const folderMoves: FolderMove[] = [];
  const fileMoves: FileMove[] = [];

  const removedFolders = ctx.dbOnly.filter(
    (row) => row.kind === "folder" && row.contentHash !== null,
  );
  const addedFolders = ctx.diskOnly.filter(
    (entry) =>
      entry.kind === "folder" && ctx.folderHashes.has(entry.relativePath),
  );

  const folderCandidates = new Map<string, typeof removedFolders>();
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
    if (ctx.handledDiskPaths.has(entry.relativePath)) continue;

    const hash = ctx.folderHashes.get(entry.relativePath);
    const candidates = (
      (hash ? folderCandidates.get(hash) : undefined) ?? []
    ).filter((row) => !ctx.movedDbRowIds.has(row.id));

    if (candidates.length === 0) continue;

    const row = pickBestMove(candidates, entry);
    folderMoves.push({ row, entry });

    for (const candidate of ctx.dbOnly) {
      if (isSameOrUnder(candidate.relativePath, row.relativePath)) {
        ctx.movedDbRowIds.add(candidate.id);
      }
    }

    for (const diskEntry of ctx.diskOnly) {
      if (isSameOrUnder(diskEntry.relativePath, entry.relativePath)) {
        ctx.handledDiskPaths.add(diskEntry.relativePath);
      }
    }
  }

  const removedFiles = ctx.dbOnly.filter(
    (row) =>
      row.kind === "file" &&
      row.contentHash !== null &&
      !ctx.movedDbRowIds.has(row.id),
  );
  const addedFiles = ctx.diskOnly.filter(
    (entry) =>
      entry.kind === "file" &&
      !ctx.handledDiskPaths.has(entry.relativePath) &&
      ctx.fileHashes.has(entry.relativePath),
  );

  const fileCandidates = new Map<string, typeof removedFiles>();
  for (const row of removedFiles) {
    const key = `${row.contentHash}:${row.size ?? ""}`;
    const list = fileCandidates.get(key);
    if (list) list.push(row);
    else fileCandidates.set(key, [row]);
  }

  for (const entry of addedFiles) {
    const hash = ctx.fileHashes.get(entry.relativePath) as string;
    const key = `${hash}:${entry.size ?? ""}`;
    const candidates = fileCandidates.get(key);
    if (!candidates || candidates.length === 0) continue;

    const row = pickBestMove(candidates, entry);
    fileMoves.push({ row, entry });
    ctx.movedDbRowIds.add(row.id);

    const index = candidates.indexOf(row);
    if (index !== -1) candidates.splice(index, 1);
  }

  ctx.folderMoveByPath = new Map(
    folderMoves.map((move) => [move.entry.relativePath, move]),
  );
  ctx.fileMoveByPath = new Map(
    fileMoves.map((move) => [move.entry.relativePath, move]),
  );
}
