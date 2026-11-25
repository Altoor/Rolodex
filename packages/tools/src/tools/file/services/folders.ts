import { ToolInputError } from "../../../model";
import {
  getFileEntryByPath,
  insertFileEntry,
  saveFileEntryWithEmbedding,
  type FileEntryRow,
} from "./entry";
import { folderContentHash } from "./hash";
import { joinRelativePath, validateEntryName } from "./paths";
import { deleteEntry, ensureDirectory, statEntry } from "./storage";

interface CreateFolderEntryArgs {
  parent: FileEntryRow | null;
  name: string;
  description?: string;
  /** Return an existing folder instead of failing when the path exists. */
  reuseExisting?: boolean;
}

/**
 * Creates (or optionally reuses) a folder at `parent/name` and indexes it.
 * Keeps the physical directory and DB row in sync on failure.
 */
export async function createFolderEntry({
  parent,
  name,
  description = "",
  reuseExisting = false,
}: CreateFolderEntryArgs): Promise<FileEntryRow> {
  const safeName = validateEntryName(name);
  const parentPath = parent?.relativePath ?? "";
  const relativePath = joinRelativePath(parentPath, safeName);

  const indexed = await getFileEntryByPath(relativePath);
  if (indexed) {
    if (indexed.kind !== "folder") {
      throw new ToolInputError(`"${relativePath}" is a file`);
    }
    if (reuseExisting) return indexed;
    throw new ToolInputError(`"${relativePath}" already exists`);
  }

  const existing = await statEntry(relativePath);
  if (existing) {
    if (existing.kind !== "folder") {
      throw new ToolInputError(`"${relativePath}" is a file`);
    }
    if (!reuseExisting) {
      throw new ToolInputError(`"${relativePath}" already exists`);
    }
  } else {
    await ensureDirectory(relativePath);
  }

  const stat = await statEntry(relativePath);
  const now = stat?.mtime ?? new Date();

  try {
    const folder = await insertFileEntry({
      kind: "folder",
      name: safeName,
      relativePath,
      parentId: parent?.id ?? null,
      description,
      contentHash: folderContentHash([]),
      filesystemModifiedAt: now,
      lastEditedAt: now,
    });

    await saveFileEntryWithEmbedding(folder);
    return folder;
  } catch (err) {
    // Keep the filesystem and DB consistent if the insert failed.
    if (!existing) {
      await deleteEntry(relativePath, { recursive: false }).catch(
        () => undefined,
      );
    }
    throw err;
  }
}
