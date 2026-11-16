import { randomUUID } from "node:crypto";
import {
  deleteEntry,
  ensureTempDirectory,
  moveEntry,
  resolveUniqueName,
  sanitizeUploadName,
  writeFileBuffer,
} from "@repo/tools/tools/file/services/storage";
import { joinRelativePath } from "@repo/tools/tools/file/services/paths";
import {
  hardDeleteFileEntryRow,
  type FileEntryRow,
} from "@repo/tools/tools/file/services/entry";
import { publishFileEvent } from "./file-events";
import { asGraphQLError, badInput } from "./file-errors";
import { resolveParent } from "./file-entry-service";
import { indexCreatedFile } from "./file-index-service";

const MAX_UPLOAD_FILES = 20;
const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024;

/** Validates an upload target before the request body is streamed. */
export async function resolveUploadParent(
  parentId?: number | null,
): Promise<FileEntryRow | null> {
  try {
    return await resolveParent(parentId);
  } catch (err) {
    throw asGraphQLError(err);
  }
}

/**
 * Moves a fully streamed temp file into place and indexes it. Used by the
 * streaming upload endpoint so large files never pass through GraphQL.
 */
export async function completeStreamedUpload(input: {
  tempRelativePath: string;
  originalName: string;
  parentId?: number | null;
}): Promise<FileEntryRow> {
  try {
    const parent = await resolveParent(input.parentId);
    const parentPath = parent?.relativePath ?? "";
    const sanitized = sanitizeUploadName(input.originalName);
    const name = await resolveUniqueName(parentPath, sanitized);
    const relativePath = joinRelativePath(parentPath, name);

    await moveEntry(input.tempRelativePath, relativePath);

    try {
      const row = await indexCreatedFile({
        relativePath,
        name,
        parentId: parent?.id ?? null,
        description: "",
      });

      publishFileEvent({
        type: "created",
        id: row.id,
        parentId: row.parentId,
        path: row.relativePath,
      });

      return row;
    } catch (err) {
      await deleteEntry(relativePath, { recursive: false }).catch(
        () => undefined,
      );
      throw err;
    }
  } catch (err) {
    throw asGraphQLError(err);
  }
}

export async function uploadFilesForApi(
  files: File[],
  parentId?: number | null,
): Promise<FileEntryRow[]> {
  if (files.length > MAX_UPLOAD_FILES) {
    throw badInput(
      `too many files: ${files.length}; the limit is ${MAX_UPLOAD_FILES}`,
    );
  }

  for (const file of files) {
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      throw badInput(
        `file "${file.name}" is ${file.size} bytes; the limit is ${MAX_UPLOAD_FILE_BYTES}`,
      );
    }
  }

  const parent = await resolveParent(parentId).catch((err: unknown) => {
    throw asGraphQLError(err);
  });
  const parentPath = parent?.relativePath ?? "";
  await ensureTempDirectory();

  const createdRows: FileEntryRow[] = [];
  const createdPaths: string[] = [];

  try {
    for (const file of files) {
      const sanitized = sanitizeUploadName(file.name);
      const name = await resolveUniqueName(parentPath, sanitized);
      const relativePath = joinRelativePath(parentPath, name);
      const tempPath = joinRelativePath(".tmp", `${randomUUID()}-${sanitized}`);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFileBuffer(tempPath, buffer, { overwrite: false });

      try {
        await moveEntry(tempPath, relativePath);
      } finally {
        await deleteEntry(tempPath, { recursive: false }).catch(
          () => undefined,
        );
      }

      createdPaths.push(relativePath);

      const row = await indexCreatedFile({
        relativePath,
        name,
        parentId: parent?.id ?? null,
        description: "",
      });
      createdRows.push(row);
      publishFileEvent({
        type: "created",
        id: row.id,
        parentId: row.parentId,
        path: row.relativePath,
      });
    }

    return createdRows;
  } catch (err) {
    for (const row of createdRows) {
      await hardDeleteFileEntryRow(row.id).catch(() => undefined);
    }
    for (const relativePath of createdPaths) {
      await deleteEntry(relativePath, { recursive: false }).catch(
        () => undefined,
      );
    }
    throw asGraphQLError(err);
  }
}
