import { readTextFile } from "@repo/tools/tools/file/services/storage";
import {
  getFileEntryById,
  listFileEntries,
  type FileEntryRow,
} from "@repo/tools/tools/file/services/entry";
import { ensureFileType } from "@repo/tools/tools/file/services/fileType";
import { asGraphQLError, badInput, notFound } from "./file-errors";

const DEFAULT_TEXT_MAX_BYTES = 5 * 1024 * 1024;

export async function requireLiveEntry(
  id: number,
  viewerId: number,
): Promise<FileEntryRow> {
  const row = await getFileEntryById(id, { viewerId });
  if (!row) throw notFound(`file entry ${id} not found`);
  return row;
}

export async function resolveParent(
  parentId: number | null | undefined,
  viewerId: number,
): Promise<FileEntryRow | null> {
  if (parentId === null || parentId === undefined) return null;

  const parent = await getFileEntryById(parentId, { viewerId });
  if (!parent || parent.kind !== "folder") {
    throw badInput(`folder ${parentId} not found`);
  }

  return parent;
}

function isReadableTextMime(mimeType: string | null): boolean {
  if (!mimeType) return true;
  return mimeType.startsWith("text/") || mimeType === "application/x-tex";
}

export async function listFileEntriesForApi(options: {
  userId: number;
  parentId?: number | null;
  includeDeleted?: boolean;
}): Promise<FileEntryRow[]> {
  // Listing a private folder owned by someone else must look like it does not
  // exist, not like an empty folder.
  if (options.parentId !== null && options.parentId !== undefined) {
    const parent = await getFileEntryById(options.parentId, {
      viewerId: options.userId,
    });
    if (!parent || parent.kind !== "folder") {
      throw notFound(`folder ${options.parentId} not found`);
    }
  }

  return listFileEntries({
    parentId: options.parentId,
    includeDeleted: options.includeDeleted ?? false,
    viewerId: options.userId,
  });
}

export async function getFileEntryForApi(
  id: number,
  userId: number,
): Promise<FileEntryRow | null> {
  return getFileEntryById(id, { viewerId: userId });
}

export async function getFileTextForApi(
  id: number,
  maxBytes: number | null | undefined,
  userId: number,
): Promise<string> {
  try {
    const row = await requireLiveEntry(id, userId);
    const { row: typedRow, detected } = await ensureFileType(row);

    if (typedRow.kind !== "file") {
      throw badInput(`"${typedRow.relativePath}" is not a file`);
    }

    if (
      detected.fileType !== "plaintext" &&
      !(detected.fileType === "text" && isReadableTextMime(detected.mimeType))
    ) {
      throw badInput(
        `"${typedRow.relativePath}" is ${detected.fileType}; text extraction is not supported`,
      );
    }

    return readTextFile(typedRow.relativePath, {
      maxBytes: maxBytes ?? DEFAULT_TEXT_MAX_BYTES,
    });
  } catch (err) {
    throw asGraphQLError(err);
  }
}
