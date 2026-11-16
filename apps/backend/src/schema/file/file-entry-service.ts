import { readTextFile } from "@repo/tools/tools/file/services/storage";
import {
  getFileEntryById,
  listFileEntries,
  type FileEntryRow,
} from "@repo/tools/tools/file/services/entry";
import { ensureFileType } from "@repo/tools/tools/file/services/fileType";
import { asGraphQLError, badInput, notFound } from "./file-errors";

const DEFAULT_TEXT_MAX_BYTES = 5 * 1024 * 1024;

export async function requireLiveEntry(id: number): Promise<FileEntryRow> {
  const row = await getFileEntryById(id);
  if (!row) throw notFound(`file entry ${id} not found`);
  return row;
}

export async function resolveParent(
  parentId: number | null | undefined,
): Promise<FileEntryRow | null> {
  if (parentId === null || parentId === undefined) return null;

  const parent = await getFileEntryById(parentId);
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
  parentId?: number | null;
  includeDeleted?: boolean;
}): Promise<FileEntryRow[]> {
  return listFileEntries({
    parentId: options.parentId,
    includeDeleted: options.includeDeleted ?? false,
  });
}

export async function getFileEntryForApi(
  id: number,
): Promise<FileEntryRow | null> {
  return getFileEntryById(id);
}

export async function getFileTextForApi(
  id: number,
  maxBytes?: number | null,
): Promise<string> {
  try {
    const row = await requireLiveEntry(id);
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
