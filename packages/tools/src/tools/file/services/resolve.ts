import { mergeToolInput, readNumber, readString } from "../../../utils";
import { ToolInputError, type ToolRunContext } from "../../../model";
import {
  getFileEntryById,
  getFileEntryByPath,
  type FileEntryRow,
} from "./entry";
import { normalizeRelativePath } from "./paths";

export function hasInputKey(
  input: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

/** Loads a parent folder by id, or returns null for the root. */
export async function resolveParentFolderById(
  id: number | null,
): Promise<FileEntryRow | null> {
  if (id === null) return null;

  const row = await getFileEntryById(id);
  if (!row || row.kind !== "folder") {
    throw new ToolInputError(`folder ${id} not found`);
  }

  return row;
}

/** Loads a parent folder by relative path, or returns null for the root. */
export async function resolveParentFolderByPath(
  path: string,
): Promise<FileEntryRow | null> {
  if (!path.trim()) return null;

  const normalized = normalizeRelativePath(path);
  const row = await getFileEntryByPath(normalized);

  if (!row || row.kind !== "folder") {
    throw new ToolInputError(`folder "${normalized}" not found`);
  }

  return row;
}

/**
 * Resolves the parent folder for create_* tools from `parentId`,
 * `parentPath`, or an embedded `folder`/`folders` toolState value.
 */
export async function resolveParentFolderFromInput(
  context: ToolRunContext,
  input: Record<string, unknown> = mergeToolInput(context),
): Promise<FileEntryRow | null> {
  if (hasInputKey(input, "parentId")) {
    const value = input.parentId;

    if (value === null) return null;

    const id = readNumber(input, "parentId");
    if (id === undefined) {
      throw new ToolInputError('"parentId" must be a number or null');
    }

    return resolveParentFolderById(id);
  }

  if (hasInputKey(input, "parentPath")) {
    const value = input.parentPath;

    if (value === null) return null;
    if (typeof value !== "string") {
      throw new ToolInputError('"parentPath" must be a string or null');
    }

    return resolveParentFolderByPath(value);
  }

  const embedded = embeddedFolder(input);
  if (embedded) {
    const id = readNumber(embedded, "id");
    if (id !== undefined) return resolveParentFolderById(id);

    const path =
      readString(embedded, "path") ?? readString(embedded, "relativePath");
    if (path) return resolveParentFolderByPath(path);
  }

  return null;
}

function embeddedFolder(
  input: Record<string, unknown>,
): Record<string, unknown> | null {
  for (const key of ["folder", "folders"]) {
    const value = input[key];

    if (Array.isArray(value)) {
      const first = value.find(
        (item) =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      );
      if (first && typeof first === "object") {
        return first as Record<string, unknown>;
      }
      continue;
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (record.kind === undefined || record.kind === "folder") {
        return record;
      }
    }
  }

  return null;
}
