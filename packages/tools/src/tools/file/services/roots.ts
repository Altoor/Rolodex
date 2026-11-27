import { ToolInputError } from "../../../model";

/** Minimal shape needed to choose between configured root folders. */
export interface RootFolderLike {
  relativePath: string;
}

/**
 * Chooses the implicit destination for `create_file` / `create_folder` when no
 * parent is supplied.
 *
 * - No root folders: keep the files-tree root (null).
 * - Exactly one root folder: create inside it.
 * - Several root folders: only possible if legacy data violates the single-root
 *   invariant; treat the destination as ambiguous and require an explicit
 *   `parentId` or `parentPath`.
 */
export function selectDefaultRootFolder<T extends RootFolderLike>(
  roots: readonly T[],
): T | null {
  if (roots.length === 0) return null;
  if (roots.length === 1) return roots[0]!;

  const paths = roots.map((root) => `"${root.relativePath}"`).join(", ");
  throw new ToolInputError(
    `multiple root folders are configured (${paths}); specify parentId or parentPath`,
  );
}
