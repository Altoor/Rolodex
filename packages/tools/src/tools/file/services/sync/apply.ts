import { eq } from "drizzle-orm";
import { db, fileEntries } from "@repo/db";
import {
  getFileEntryByPath,
  insertFileEntry,
  saveFileEntryWithEmbedding,
  softDeleteFileEntryRow,
  updateFileEntryRow,
  type FileEntryRow,
  type NewFileEntryRow,
} from "../entry";
import type { ManifestEntry } from "../manifest";
import type { SyncContext } from "./context";
import { metaFor, metadataDiffers, metadataValues } from "./fingerprints";
import {
  depthOf,
  errorMessage,
  isSameOrUnder,
  latestDate,
  statUnchanged,
} from "./helpers";
import { pushEntry, scanEntryFromMeta, scanEntryFromRow } from "./report";
import type { FileMove, FolderMove, InBoth, KindChange } from "./types";

/**
 * Applies updates, inserts, moves, kind changes, and soft deletes in depth
 * order so a child's parent row always exists first.
 */
export async function applyChanges(ctx: SyncContext): Promise<void> {
  for (const entry of ctx.manifest.entries) {
    const folderMove = ctx.folderMoveByPath.get(entry.relativePath);
    if (folderMove) {
      await applyFolderMove(ctx, folderMove);
      continue;
    }

    if (ctx.handledDiskPaths.has(entry.relativePath)) continue;

    const fileMove = ctx.fileMoveByPath.get(entry.relativePath);
    if (fileMove) {
      await applyFileMove(ctx, fileMove);
      continue;
    }

    const kindChange = ctx.kindChangeByPath.get(entry.relativePath);
    if (kindChange) {
      await applyKindChange(ctx, kindChange);
      continue;
    }

    const existing = ctx.inBothByPath.get(entry.relativePath);
    if (existing) {
      await applyInBoth(ctx, existing);
      continue;
    }

    await applyAdded(ctx, entry);
  }

  const deletedRows = ctx.dbOnly
    .filter((row) => !ctx.movedDbRowIds.has(row.id))
    .sort(
      (left, right) => depthOf(right.relativePath) - depthOf(left.relativePath),
    );

  for (const row of deletedRows) {
    try {
      if (ctx.options.apply) await softDeleteFileEntryRow(row.id);
      pushEntry(ctx, scanEntryFromRow("deleted", row));
    } catch (err) {
      ctx.report.warnings.push(
        `Could not delete "${row.relativePath}": ${errorMessage(err)}`,
      );
    }
  }
}

async function applyInBoth(ctx: SyncContext, item: InBoth): Promise<void> {
  const { entry, row } = item;
  const meta = metaFor(ctx, entry);
  const change = changeStatusFor(ctx, entry, row);

  try {
    if (ctx.options.apply) {
      const values = metadataValues(meta);
      if (metadataDiffers(row, values)) {
        await updateFileEntryRow(row.id, values);
      }
    }
    pushEntry(ctx, scanEntryFromMeta(change, meta, row.id));
  } catch (err) {
    ctx.report.warnings.push(
      `Could not update "${entry.relativePath}": ${errorMessage(err)}`,
    );
  }
}

async function applyKindChange(
  ctx: SyncContext,
  item: KindChange,
): Promise<void> {
  const { entry, row } = item;
  const meta = metaFor(ctx, entry);
  let newId: number | null = null;

  try {
    if (ctx.options.apply) {
      await softDeleteFileEntryRow(row.id);
      const parentId = await resolveParentId(ctx, entry.parentPath);
      const inserted = await insertFileEntry({
        kind: entry.kind,
        name: entry.name,
        relativePath: entry.relativePath,
        parentId,
        description: row.description,
        ...metadataValues(meta),
      });
      ctx.idByPath.set(entry.relativePath, inserted.id);
      newId = inserted.id;
      await saveFileEntryWithEmbedding(inserted);
    }
    // A kind change is reported as a change, not a delete + add.
    pushEntry(ctx, scanEntryFromMeta("changed", meta, newId));
  } catch (err) {
    ctx.report.warnings.push(
      `Could not replace "${entry.relativePath}": ${errorMessage(err)}`,
    );
  }
}

async function applyAdded(
  ctx: SyncContext,
  entry: ManifestEntry,
): Promise<void> {
  const meta = metaFor(ctx, entry);
  let newId: number | null = null;

  try {
    if (ctx.options.apply) {
      const parentId = await resolveParentId(ctx, entry.parentPath);
      const inserted = await insertFileEntry({
        kind: entry.kind,
        name: entry.name,
        relativePath: entry.relativePath,
        parentId,
        description: "",
        ...metadataValues(meta),
      });
      ctx.idByPath.set(entry.relativePath, inserted.id);
      newId = inserted.id;
      await saveFileEntryWithEmbedding(inserted);
    }
    pushEntry(ctx, scanEntryFromMeta("added", meta, newId));
  } catch (err) {
    ctx.report.warnings.push(
      `Could not add "${entry.relativePath}": ${errorMessage(err)}`,
    );
  }
}

async function applyFileMove(ctx: SyncContext, move: FileMove): Promise<void> {
  const { row, entry } = move;
  const meta = metaFor(ctx, entry);
  const fromPath = row.relativePath;

  try {
    if (ctx.options.apply) {
      const parentId = await resolveParentId(ctx, entry.parentPath);
      const updated = await updateFileEntryRow(row.id, {
        relativePath: entry.relativePath,
        parentId,
        name: entry.name,
        ...metadataValues(meta),
        lastEditedAt: latestDate(row.lastEditedAt, meta.lastEditedAt),
      });
      ctx.idByPath.delete(fromPath);
      ctx.idByPath.set(entry.relativePath, updated.id);
      await saveFileEntryWithEmbedding(updated);
    }
    pushEntry(ctx, scanEntryFromMeta("moved", meta, row.id, fromPath));
  } catch (err) {
    ctx.report.warnings.push(
      `Could not move "${fromPath}" to "${entry.relativePath}": ${errorMessage(err)}`,
    );
  }
}

async function applyFolderMove(
  ctx: SyncContext,
  move: FolderMove,
): Promise<void> {
  const { row, entry } = move;
  const fromPath = row.relativePath;
  const toPath = entry.relativePath;
  const meta = metaFor(ctx, entry);

  try {
    if (ctx.options.apply) {
      const newParentId = await resolveParentId(ctx, entry.parentPath);
      const subtree = ctx.snapshotRows
        .filter((candidate) => isSameOrUnder(candidate.relativePath, fromPath))
        .sort(
          (left, right) =>
            depthOf(left.relativePath) - depthOf(right.relativePath),
        );

      const updatedRows = await db.transaction(async (tx) => {
        const result: FileEntryRow[] = [];

        for (const subtreeRow of subtree) {
          const newPath =
            toPath + subtreeRow.relativePath.slice(fromPath.length);
          const diskEntry = ctx.manifestByPath.get(newPath);
          const diskMeta = diskEntry ? metaFor(ctx, diskEntry) : null;

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
        ctx.idByPath.delete(subtreeRow.relativePath);
      }
      for (const updated of updatedRows) {
        ctx.idByPath.set(updated.relativePath, updated.id);
        await saveFileEntryWithEmbedding(updated);
      }
    }

    pushEntry(ctx, scanEntryFromMeta("moved", meta, row.id, fromPath));
  } catch (err) {
    ctx.report.warnings.push(
      `Could not move folder "${fromPath}" to "${toPath}": ${errorMessage(err)}`,
    );
  }
}

function changeStatusFor(
  ctx: SyncContext,
  entry: ManifestEntry,
  row: FileEntryRow,
): "changed" | "unchanged" {
  if (entry.kind === "file") {
    const computed = ctx.fileHashes.get(entry.relativePath);
    if (computed !== undefined) {
      if (row.contentHash == null) {
        return statUnchanged(row, entry) ? "unchanged" : "changed";
      }
      return computed === row.contentHash ? "unchanged" : "changed";
    }
    if (ctx.staleHashPaths.has(entry.relativePath)) return "changed";
    return "unchanged";
  }

  const computed = ctx.folderHashes.get(entry.relativePath);
  if (
    computed !== undefined &&
    row.contentHash != null &&
    computed !== row.contentHash
  ) {
    return "changed";
  }
  return "unchanged";
}

async function resolveParentId(
  ctx: SyncContext,
  folderPath: string,
): Promise<number | null> {
  if (!folderPath) return null;

  const existing = ctx.idByPath.get(folderPath);
  if (existing !== undefined) return existing;

  const row = await getFileEntryByPath(folderPath);
  if (row) {
    ctx.idByPath.set(folderPath, row.id);
    return row.id;
  }

  return null;
}
