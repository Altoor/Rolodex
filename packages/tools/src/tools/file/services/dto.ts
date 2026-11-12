import type { FileEntryRow } from "./entry";

/**
 * Stable file/folder shape shared by every tool output and, later, the
 * GraphQL API. `path` is POSIX-relative to FILES_ROOT.
 */
export interface FileEntryRef {
  id: number;
  kind: "file" | "folder";
  name: string;
  description: string;
  path: string;
  parentId: number | null;
  fileType: string | null;
  mimeType: string | null;
  size: number | null;
  contentHash: string | null;
  lastEditedAt: string | null;
  filesystemModifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface FileEntryCandidate extends FileEntryRef {
  score: number;
}

export function toFileEntryRef(row: FileEntryRow): FileEntryRef {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    path: row.relativePath,
    parentId: row.parentId,
    fileType: row.fileType,
    mimeType: row.mimeType,
    size: row.size,
    contentHash: row.contentHash,
    lastEditedAt: row.lastEditedAt.toISOString(),
    filesystemModifiedAt: row.filesystemModifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/**
 * Drops the transient search score so toolState entries keep the documented
 * FileEntryRef shape.
 */
export function withoutScore(candidate: FileEntryCandidate): FileEntryRef {
  const copy: FileEntryCandidate & { score?: number } = { ...candidate };
  Reflect.deleteProperty(copy, "score");
  return copy;
}
