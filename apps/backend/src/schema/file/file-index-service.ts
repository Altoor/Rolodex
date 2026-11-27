import { detectFileType } from "@repo/tools/tools/file/services/type";
import { hashFile } from "@repo/tools/tools/file/services/hash";
import {
  insertFileEntry,
  saveFileEntryWithEmbedding,
  type FileEntryRow,
} from "@repo/tools/tools/file/services/entry";
import { statEntry } from "@repo/tools/tools/file/services/storage";
import { syncFileTree } from "@repo/tools/tools/file/services/sync";
import { filterScanReportForViewer } from "@repo/tools/tools/file/services/access";
import { publishFileEvent } from "./file-events";
import { asGraphQLError } from "./file-errors";

export async function indexFileTreeForApi(
  options: {
    path?: string | null;
    apply?: boolean | null;
  },
  userId: number,
) {
  try {
    const report = await filterScanReportForViewer(
      await syncFileTree({
        path: options.path ?? undefined,
        apply: options.apply ?? true,
      }),
      userId,
    );

    publishFileEvent({
      type: "indexed",
      id: null,
      parentId: null,
      path: options.path ?? null,
    });

    return report;
  } catch (err) {
    throw asGraphQLError(err);
  }
}

/** Indexes a file that already exists on disk. */
export async function indexCreatedFile(input: {
  relativePath: string;
  name: string;
  parentId: number | null;
  description: string;
}): Promise<FileEntryRow> {
  const stat = await statEntry(input.relativePath);
  if (!stat) throw new Error(`file "${input.relativePath}" was not written`);

  const detected = await detectFileType(input.relativePath);
  const contentHash = await hashFile(input.relativePath);
  const now = new Date();

  const row = await insertFileEntry({
    kind: "file",
    name: input.name,
    relativePath: input.relativePath,
    parentId: input.parentId,
    description: input.description,
    fileType: detected.fileType,
    mimeType: detected.mimeType,
    size: stat.size,
    contentHash,
    filesystemModifiedAt: stat.mtime,
    lastEditedAt: new Date(Math.max(stat.mtimeMs, now.getTime())),
  });

  await saveFileEntryWithEmbedding(row);
  return row;
}
