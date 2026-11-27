import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, fileEntries } from "@repo/db";
import type { ScanCounts, ScanEntry, ScanReport } from "./sync/types";
import { TEMP_DIR_NAME, TRIALS_DIR_NAME, isInternalPath } from "./paths";

/**
 * Internal workspace paths (uploads and assisted trials) are never visible to
 * any user. Trial copies of private files keep the original relative path
 * below `.trials/<run>/<attempt>/`, so an ancestor check on the private folder
 * would not catch them; hiding the whole internal tree closes that gap.
 */
function internalPathCondition(): SQL {
  return sql`NOT (
    "fileEntries"."relativePath" = ${TRIALS_DIR_NAME}
    OR starts_with(
      "fileEntries"."relativePath",
      ${`${TRIALS_DIR_NAME}/`}
    )
    OR "fileEntries"."relativePath" = ${TEMP_DIR_NAME}
    OR starts_with("fileEntries"."relativePath", ${`${TEMP_DIR_NAME}/`})
  )`;
}

/**
 * File-tree visibility rules.
 *
 * A folder can be marked private. Privacy is inherited through the physical
 * path, so every descendant of a private folder is only visible to that
 * folder's owner. Keeping the rule path-based means moving a folder into or
 * out of a private tree automatically updates what its descendants expose.
 */
export function accessibleFileEntryCondition(viewerId: number): SQL {
  return sql`${internalPathCondition()} AND NOT EXISTS (
    SELECT 1 FROM "fileEntries" AS "accessAncestor"
    WHERE "accessAncestor"."isPrivate" = TRUE
      AND (
        "accessAncestor"."deletedAt" IS NULL
        OR "fileEntries"."deletedAt" IS NOT NULL
      )
      AND "accessAncestor"."ownerId" IS DISTINCT FROM ${viewerId}
      AND (
        "fileEntries"."relativePath" = "accessAncestor"."relativePath"
        OR starts_with(
          "fileEntries"."relativePath",
          "accessAncestor"."relativePath" || '/'
        )
      )
  )`;
}

/** Private folders that belong to someone other than the viewer. */
export async function hiddenPrivateFolderPaths(
  viewerId: number,
  options: { includeDeleted?: boolean } = {},
): Promise<string[]> {
  const rows = await db
    .select({ path: fileEntries.relativePath })
    .from(fileEntries)
    .where(
      and(
        eq(fileEntries.kind, "folder"),
        eq(fileEntries.isPrivate, true),
        options.includeDeleted ? undefined : isNull(fileEntries.deletedAt),
        sql`${fileEntries.ownerId} IS DISTINCT FROM ${viewerId}`,
      ),
    );

  return rows.map((row) => row.path);
}

/** True when a path is a hidden private folder or one of its descendants. */
export function isPathHidden(
  relativePath: string,
  hiddenFolders: readonly string[],
): boolean {
  return hiddenFolders.some(
    (folder) =>
      relativePath === folder || relativePath.startsWith(`${folder}/`),
  );
}

/** Drops entries that the viewer may not see from a scan report. */
export async function filterScanReportForViewer(
  report: ScanReport,
  viewerId: number,
): Promise<ScanReport> {
  const liveHidden = await hiddenPrivateFolderPaths(viewerId);
  const allHidden = await hiddenPrivateFolderPaths(viewerId, {
    includeDeleted: true,
  });

  const entries = report.entries.filter((entry) => {
    // Internal paths are never reported, even when they are not below a
    // private folder.
    if (isInternalPath(entry.path)) return false;
    if (entry.fromPath && isInternalPath(entry.fromPath)) return false;

    // Deleted report entries may point below a private folder that was also
    // deleted, so they need the deleted-folder list. Live entries use only
    // live folders so a reused path does not stay hidden.
    const pathHidden =
      entry.change === "deleted"
        ? isPathHidden(entry.path, allHidden)
        : isPathHidden(entry.path, liveHidden);
    const fromHidden = entry.fromPath
      ? isPathHidden(entry.fromPath, allHidden)
      : false;

    return !pathHidden && !fromHidden;
  });

  return {
    ...report,
    entries,
    counts: countScanChanges(entries),
  };
}

/** True when a live-event path is safe to show to the viewer. */
export async function isPathAccessibleToViewer(
  viewerId: number,
  relativePath: string | null | undefined,
  options: { includeDeleted?: boolean } = {},
): Promise<boolean> {
  if (!relativePath || !relativePath.trim()) return true;
  if (isInternalPath(relativePath)) return false;

  return !isPathHidden(
    relativePath,
    await hiddenPrivateFolderPaths(viewerId, {
      includeDeleted: options.includeDeleted,
    }),
  );
}

/** Live folders the viewer marked as search roots, ordered by path. */
export async function accessibleRootFolders(
  viewerId: number,
): Promise<(typeof fileEntries.$inferSelect)[]> {
  return db
    .select()
    .from(fileEntries)
    .where(
      and(
        eq(fileEntries.kind, "folder"),
        eq(fileEntries.isRoot, true),
        isNull(fileEntries.deletedAt),
        accessibleFileEntryCondition(viewerId),
      ),
    )
    .orderBy(fileEntries.relativePath);
}

/**
 * Search scope for task/flow tools. When the viewer owns at least one
 * accessible root folder, searches are limited to those subtrees. Otherwise
 * the whole accessible tree is searched.
 */
export async function fileSearchScopeCondition(
  viewerId: number,
): Promise<SQL | undefined> {
  const roots = await accessibleRootFolders(viewerId);

  if (roots.length === 0) return undefined;

  return or(
    ...roots.map(
      ({ relativePath }) =>
        sql`(${fileEntries.relativePath} = ${relativePath} OR starts_with(${fileEntries.relativePath}, ${`${relativePath}/`}))`,
    ),
  );
}

function countScanChanges(entries: ScanEntry[]): ScanCounts {
  const counts: ScanCounts = {
    added: 0,
    changed: 0,
    moved: 0,
    deleted: 0,
    unchanged: 0,
  };

  for (const entry of entries) counts[entry.change] += 1;
  return counts;
}
