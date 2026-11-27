import { and, eq, isNull, ne } from "drizzle-orm";
import { db, fileEntries } from "@repo/db";
import {
  deleteEntry,
  ensureDirectory,
  listDirectory,
  moveEntry,
  statEntry,
  writeTextFile,
} from "@repo/tools/tools/file/services/storage";
import {
  joinRelativePath,
  parentRelativePath,
  validateEntryName,
} from "@repo/tools/tools/file/services/paths";
import {
  folderContentHash,
  hashFile,
} from "@repo/tools/tools/file/services/hash";
import { detectFileTypeFromName } from "@repo/tools/tools/file/services/type";
import {
  getFileEntryByPath,
  insertFileEntry,
  moveFileEntryTree,
  refreshFileEntryEmbedding,
  saveFileEntryWithEmbedding,
  softDeleteFileEntryTree,
  updateFileEntryRow,
  type FileEntryRow,
} from "@repo/tools/tools/file/services/entry";
import { ensureFileType } from "@repo/tools/tools/file/services/fileType";
import { publishFileEvent } from "./file-events";
import { asGraphQLError, badInput } from "./file-errors";
import { requireLiveEntry, resolveParent } from "./file-entry-service";
import { indexCreatedFile } from "./file-index-service";

function assertNameAvailable(
  relativePath: string,
  existing: FileEntryRow | null,
): void {
  if (existing) throw badInput(`"${relativePath}" already exists`);
}

interface ClearedRoot {
  id: number;
  parentId: number | null;
  relativePath: string;
}

/**
 * The workspace has at most one root folder. Marking a new root clears every
 * other live root so searches and implicit create destinations stay
 * unambiguous.
 */
async function clearOtherRootFolders(rootId: number): Promise<ClearedRoot[]> {
  return db
    .update(fileEntries)
    .set({ isRoot: false, updatedAt: new Date() })
    .where(
      and(
        eq(fileEntries.isRoot, true),
        ne(fileEntries.id, rootId),
        isNull(fileEntries.deletedAt),
      ),
    )
    .returning({
      id: fileEntries.id,
      parentId: fileEntries.parentId,
      relativePath: fileEntries.relativePath,
    });
}

function publishClearedRoots(roots: ClearedRoot[]): void {
  for (const root of roots) {
    publishFileEvent({
      type: "updated",
      id: root.id,
      parentId: root.parentId,
      path: root.relativePath,
    });
  }
}

async function directoryChildCount(relativePath: string): Promise<number> {
  try {
    return (await listDirectory(relativePath)).length;
  } catch (err) {
    // The index can outlive the physical folder (external deletion); treat a
    // missing folder as empty so the row can still be soft-deleted.
    if (err instanceof Error && /not found/i.test(err.message)) return 0;
    throw err;
  }
}

export async function createFileEntryForApi(input: {
  kind: "file" | "folder";
  parentId?: number | null;
  name: string;
  description?: string | null;
  content?: string | null;
  private?: boolean | null;
  root?: boolean | null;
  userId: number;
}): Promise<FileEntryRow> {
  try {
    const name = validateEntryName(input.name);
    const parent = await resolveParent(input.parentId, input.userId);
    const relativePath = joinRelativePath(parent?.relativePath ?? "", name);

    assertNameAvailable(
      relativePath,
      await getFileEntryByPath(relativePath, { viewerId: input.userId }),
    );

    if (input.kind === "file" && (input.private || input.root)) {
      throw badInput("private and root apply to folders only");
    }

    if (input.kind === "folder") {
      if (await statEntry(relativePath)) {
        throw badInput(`"${relativePath}" already exists`);
      }

      const isPrivate = input.private ?? false;
      const isRoot = input.root ?? false;
      await ensureDirectory(relativePath);
      const stat = await statEntry(relativePath);
      const now = stat?.mtime ?? new Date();

      try {
        const row = await insertFileEntry({
          kind: "folder",
          name,
          relativePath,
          parentId: parent?.id ?? null,
          description: input.description ?? "",
          ownerId: isPrivate ? input.userId : null,
          isPrivate,
          isRoot,
          contentHash: folderContentHash([]),
          filesystemModifiedAt: now,
          lastEditedAt: now,
        });
        await saveFileEntryWithEmbedding(row);

        if (row.isRoot) {
          publishClearedRoots(await clearOtherRootFolders(row.id));
        }

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
        await softDeleteFileEntryTree(relativePath).catch(() => undefined);
        throw err;
      }
    }

    const content = input.content ?? "";
    const detected = detectFileTypeFromName(name);
    if (detected.fileType !== "plaintext") {
      throw badInput(
        `createFileEntry supports plaintext files only; "${name}" is ${detected.fileType}`,
      );
    }

    if (await statEntry(relativePath)) {
      throw badInput(`"${relativePath}" already exists`);
    }

    await writeTextFile(relativePath, content, {
      overwrite: false,
      createParent: false,
    });

    try {
      const row = await indexCreatedFile({
        relativePath,
        name,
        parentId: parent?.id ?? null,
        description: input.description ?? "",
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

export async function updateFileEntryForApi(input: {
  id: number;
  name?: string | null;
  description?: string | null;
  parentId?: number | null;
  parentIdProvided: boolean;
  private?: boolean | null;
  privateProvided: boolean;
  root?: boolean | null;
  rootProvided: boolean;
  userId: number;
}): Promise<FileEntryRow> {
  try {
    const row = await requireLiveEntry(input.id, input.userId);
    const name =
      input.name !== undefined && input.name !== null
        ? validateEntryName(input.name)
        : row.name;
    const description =
      input.description !== undefined && input.description !== null
        ? input.description
        : row.description;

    const isFolder = row.kind === "folder";
    let isPrivate = isFolder ? row.isPrivate : false;
    let ownerId = isFolder ? row.ownerId : null;
    let isRoot = isFolder ? row.isRoot : false;

    if (isFolder && input.privateProvided) {
      const nextPrivate = input.private ?? false;

      if (!nextPrivate && row.isPrivate && row.ownerId !== input.userId) {
        throw badInput("only the folder owner can make it public");
      }

      isPrivate = nextPrivate;
      ownerId = nextPrivate ? (row.ownerId ?? input.userId) : null;
    }

    if (isFolder && input.rootProvided) {
      isRoot = input.root ?? false;
    }

    let parentId = row.parentId;
    let parentPath = parentRelativePath(row.relativePath);

    if (input.parentIdProvided) {
      const parent = await resolveParent(input.parentId, input.userId);
      parentId = parent?.id ?? null;
      parentPath = parent?.relativePath ?? "";
    }

    const newPath = joinRelativePath(parentPath, name);

    if (
      row.kind === "folder" &&
      newPath !== row.relativePath &&
      newPath.startsWith(`${row.relativePath}/`)
    ) {
      throw badInput("a folder cannot be moved inside itself");
    }

    if (newPath !== row.relativePath) {
      const destination = await getFileEntryByPath(newPath, {
        viewerId: input.userId,
      });
      if (destination && destination.id !== row.id) {
        throw badInput(`"${newPath}" already exists`);
      }

      await moveEntry(row.relativePath, newPath);

      let root: FileEntryRow;
      try {
        const updated = await moveFileEntryTree(
          row.id,
          row.relativePath,
          newPath,
          { name, parentId, description, isPrivate, ownerId, isRoot },
        );

        for (const changed of updated) {
          await refreshFileEntryEmbedding(changed.id);
        }

        root = updated.find((candidate) => candidate.id === row.id) ?? row;
      } catch (err) {
        await moveEntry(newPath, row.relativePath).catch(() => undefined);
        throw err;
      }

      if (root.isRoot) {
        publishClearedRoots(await clearOtherRootFolders(root.id));
      }
      publishFileEvent({
        type: "updated",
        id: root.id,
        parentId: root.parentId,
        path: root.relativePath,
      });
      return root;
    }

    const metadataChanged =
      name !== row.name ||
      description !== row.description ||
      parentId !== row.parentId ||
      isPrivate !== row.isPrivate ||
      ownerId !== row.ownerId ||
      isRoot !== row.isRoot;

    if (!metadataChanged) return row;

    const updated = await updateFileEntryRow(row.id, {
      name,
      description,
      parentId,
      isPrivate,
      ownerId,
      isRoot,
    });

    if (updated.isRoot) {
      publishClearedRoots(await clearOtherRootFolders(updated.id));
    }

    await refreshFileEntryEmbedding(updated.id);
    publishFileEvent({
      type: "updated",
      id: updated.id,
      parentId: updated.parentId,
      path: updated.relativePath,
    });
    return updated;
  } catch (err) {
    throw asGraphQLError(err);
  }
}

export async function deleteFileEntryForApi(
  id: number,
  recursive: boolean | null | undefined,
  userId: number,
): Promise<string> {
  try {
    const row = await requireLiveEntry(id, userId);

    if (
      row.kind === "folder" &&
      !recursive &&
      (await directoryChildCount(row.relativePath)) > 0
    ) {
      throw badInput(
        `folder "${row.relativePath}" is not empty; set recursive=true to delete it`,
      );
    }

    if (await statEntry(row.relativePath)) {
      await deleteEntry(row.relativePath, { recursive: recursive ?? false });
    }

    await softDeleteFileEntryTree(row.relativePath);

    publishFileEvent({
      type: "deleted",
      id: row.id,
      parentId: row.parentId,
      path: row.relativePath,
    });

    return `Deleted ${row.kind} "${row.relativePath}"`;
  } catch (err) {
    throw asGraphQLError(err);
  }
}

export async function writeFileTextForApi(
  id: number,
  content: string,
  userId: number,
): Promise<FileEntryRow> {
  try {
    const row = await requireLiveEntry(id, userId);
    const { row: typedRow, detected } = await ensureFileType(row);

    if (typedRow.kind !== "file" || detected.fileType !== "plaintext") {
      throw badInput(
        `writeFileText only supports plaintext files; "${typedRow.relativePath}" is ${typedRow.kind === "folder" ? "a folder" : detected.fileType}`,
      );
    }

    const stat = await writeTextFile(typedRow.relativePath, content, {
      overwrite: true,
    });
    const contentHash = await hashFile(typedRow.relativePath);

    const updated = await updateFileEntryRow(typedRow.id, {
      size: stat.size,
      contentHash,
      filesystemModifiedAt: stat.mtime,
      lastEditedAt: new Date(
        Math.max(typedRow.lastEditedAt.getTime(), stat.mtimeMs),
      ),
    });

    publishFileEvent({
      type: "updated",
      id: updated.id,
      parentId: updated.parentId,
      path: updated.relativePath,
    });

    return updated;
  } catch (err) {
    throw asGraphQLError(err);
  }
}
