import type { FileEntryRow } from "../entry";
import type { ManifestEntry } from "../manifest";
import { parentRelativePath } from "../paths";

export function statUnchanged(
  row: FileEntryRow,
  entry: ManifestEntry,
): boolean {
  return (
    row.size === entry.size &&
    row.filesystemModifiedAt !== null &&
    row.filesystemModifiedAt.getTime() === Math.trunc(entry.mtimeMs)
  );
}

export function pickBestMove(
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

export function scoreMove(row: FileEntryRow, entry: ManifestEntry): number {
  const sameName = row.name === entry.name ? 100 : 0;
  const sameParent =
    parentRelativePath(row.relativePath) === entry.parentPath ? 10 : 0;
  const commonSegments = commonPrefixSegments(
    parentRelativePath(row.relativePath),
    entry.parentPath,
  );
  return sameName + sameParent + commonSegments;
}

export function commonPrefixSegments(left: string, right: string): number {
  const leftSegments = left ? left.split("/") : [];
  const rightSegments = right ? right.split("/") : [];
  const limit = Math.min(leftSegments.length, rightSegments.length);

  let count = 0;
  while (count < limit && leftSegments[count] === rightSegments[count]) {
    count += 1;
  }

  return count;
}

export function isSameOrUnder(relativePath: string, prefix: string): boolean {
  return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
}

export function latestDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

export function depthOf(relativePath: string): number {
  return relativePath.split("/").length;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
