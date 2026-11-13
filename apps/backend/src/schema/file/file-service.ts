import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";
import { ToolInputError } from "@repo/tools";
import { TOKEN_SECRET } from "../../config";
import { getUser } from "../user/user-service";
import {
  deleteEntry,
  ensureDirectory,
  ensureTempDirectory,
  listDirectory,
  moveEntry,
  readTextFile,
  resolveUniqueName,
  sanitizeUploadName,
  statEntry,
  writeFileBuffer,
  writeTextFile,
} from "@repo/tools/tools/file/services/storage";
import {
  FilesystemError,
  assertRealPathInsideRoot,
  joinRelativePath,
  parentRelativePath,
  validateEntryName,
} from "@repo/tools/tools/file/services/paths";
import {
  folderContentHash,
  hashFile,
} from "@repo/tools/tools/file/services/hash";
import {
  detectFileType,
  detectFileTypeFromName,
} from "@repo/tools/tools/file/services/type";
import {
  getFileEntryById,
  getFileEntryByPath,
  hardDeleteFileEntryRow,
  insertFileEntry,
  listFileEntries,
  moveFileEntryTree,
  refreshFileEntryEmbedding,
  saveFileEntryWithEmbedding,
  softDeleteFileEntryTree,
  updateFileEntryRow,
  type FileEntryRow,
} from "@repo/tools/tools/file/services/entry";
import { ensureFileType } from "@repo/tools/tools/file/services/fileType";
import { syncFileTree } from "@repo/tools/tools/file/services/sync";
import { publishFileEvent } from "./file-events";

const DEFAULT_TEXT_MAX_BYTES = 5 * 1024 * 1024;
const VIEW_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_UPLOAD_FILES = 20;
const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024;

export class FileViewError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "FileViewError";
  }
}

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT" },
  });
}

function notFound(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "NOT_FOUND" },
  });
}

function asGraphQLError(err: unknown): GraphQLError {
  if (err instanceof GraphQLError) return err;

  // Filesystem/tool validation errors use relative paths and are safe to show.
  if (err instanceof FilesystemError || err instanceof ToolInputError) {
    return badInput(err.message);
  }

  // Do not leak absolute paths, SQL, or stack details to API clients.
  console.error("File operation failed:", err);
  return new GraphQLError("File operation failed", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
}

async function requireLiveEntry(id: number): Promise<FileEntryRow> {
  const row = await getFileEntryById(id);
  if (!row) throw notFound(`file entry ${id} not found`);
  return row;
}

async function resolveParent(
  parentId: number | null | undefined,
): Promise<FileEntryRow | null> {
  if (parentId === null || parentId === undefined) return null;

  const parent = await getFileEntryById(parentId);
  if (!parent || parent.kind !== "folder") {
    throw badInput(`folder ${parentId} not found`);
  }

  return parent;
}

function assertNameAvailable(
  relativePath: string,
  existing: FileEntryRow | null,
): void {
  if (existing) throw badInput(`"${relativePath}" already exists`);
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

export async function createFileViewTokenForApi(
  userId: number,
  id: number,
): Promise<{ url: string; expiresAt: Date }> {
  const row = await requireLiveEntry(id);

  if (row.kind !== "file") {
    throw badInput(`"${row.relativePath}" is not a file`);
  }

  const token = jwt.sign(
    { sub: userId, fileId: row.id, purpose: "file-view" },
    TOKEN_SECRET,
    { expiresIn: "5m" },
  );

  return {
    url: `/files/${row.id}/content?token=${encodeURIComponent(token)}`,
    expiresAt: new Date(Date.now() + VIEW_TOKEN_TTL_MS),
  };
}

export async function createFileEntryForApi(input: {
  kind: "file" | "folder";
  parentId?: number | null;
  name: string;
  description?: string | null;
  content?: string | null;
}): Promise<FileEntryRow> {
  try {
    const name = validateEntryName(input.name);
    const parent = await resolveParent(input.parentId);
    const relativePath = joinRelativePath(parent?.relativePath ?? "", name);

    assertNameAvailable(relativePath, await getFileEntryByPath(relativePath));

    if (input.kind === "folder") {
      if (await statEntry(relativePath)) {
        throw badInput(`"${relativePath}" already exists`);
      }

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
          contentHash: folderContentHash([]),
          filesystemModifiedAt: now,
          lastEditedAt: now,
        });
        await saveFileEntryWithEmbedding(row);
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
}): Promise<FileEntryRow> {
  try {
    const row = await requireLiveEntry(input.id);
    const name =
      input.name !== undefined && input.name !== null
        ? validateEntryName(input.name)
        : row.name;
    const description =
      input.description !== undefined && input.description !== null
        ? input.description
        : row.description;

    let parentId = row.parentId;
    let parentPath = parentRelativePath(row.relativePath);

    if (input.parentIdProvided) {
      const parent = await resolveParent(input.parentId);
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
      const destination = await getFileEntryByPath(newPath);
      if (destination && destination.id !== row.id) {
        throw badInput(`"${newPath}" already exists`);
      }

      await moveEntry(row.relativePath, newPath);

      try {
        const updated = await moveFileEntryTree(
          row.id,
          row.relativePath,
          newPath,
          { name, parentId, description },
        );

        for (const changed of updated) {
          await refreshFileEntryEmbedding(changed.id);
        }

        const root = updated.find((candidate) => candidate.id === row.id) ?? row;
        publishFileEvent({
          type: "updated",
          id: root.id,
          parentId: root.parentId,
          path: root.relativePath,
        });
        return root;
      } catch (err) {
        await moveEntry(newPath, row.relativePath).catch(() => undefined);
        throw err;
      }
    }

    const metadataChanged =
      name !== row.name ||
      description !== row.description ||
      parentId !== row.parentId;

    if (!metadataChanged) return row;

    const updated = await updateFileEntryRow(row.id, {
      name,
      description,
      parentId,
    });

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
  recursive?: boolean | null,
): Promise<string> {
  try {
    const row = await requireLiveEntry(id);

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
): Promise<FileEntryRow> {
  try {
    const row = await requireLiveEntry(id);
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

export async function indexFileTreeForApi(options: {
  path?: string | null;
  apply?: boolean | null;
}) {
  try {
    const report = await syncFileTree({
      path: options.path ?? undefined,
      apply: options.apply ?? true,
    });

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

export async function verifyFileViewToken(
  token: string | null,
  id: number,
): Promise<FileEntryRow> {
  if (!token) throw new FileViewError("Missing file view token", 401);

  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, TOKEN_SECRET);
  } catch {
    throw new FileViewError("Invalid or expired file view token", 403);
  }

  if (
    typeof payload === "string" ||
    payload.purpose !== "file-view" ||
    typeof payload.fileId !== "number" ||
    payload.fileId !== id ||
    typeof payload.sub !== "number"
  ) {
    throw new FileViewError("File view token does not match this file", 403);
  }

  try {
    await getUser(payload.sub);
  } catch {
    throw new FileViewError("File view token user no longer exists", 401);
  }

  const row = await getFileEntryById(id);
  if (!row || row.kind !== "file") {
    throw new FileViewError("File not found", 404);
  }

  return row;
}

/** Node handler for GET /files/:id/content. */
export async function handleFileViewRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const match = /^\/files\/(\d+)\/content\/?$/.exec(url.pathname);
  const id = match ? Number(match[1]) : Number.NaN;

  try {
    if (!match || !Number.isInteger(id)) {
      throw new FileViewError("File not found", 404);
    }

    const row = await verifyFileViewToken(url.searchParams.get("token"), id);
    const stat = await statEntry(row.relativePath);

    if (!stat || stat.kind !== "file") {
      throw new FileViewError("File not found", 404);
    }

    await assertRealPathInsideRoot(stat.absolutePath);

    const mimeType = await fileMimeType(row);
    const download = url.searchParams.get("download") === "1";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    );

    const range = parseRangeHeader(req.headers.range, stat.size ?? 0);

    if (range === "invalid") {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${stat.size ?? 0}`);
      res.end();
      return;
    }

    if (range) {
      const { start, end } = range;
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Content-Length", String(end - start + 1));

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      await pipeFile(stat.absolutePath, res, start, end);
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Length", String(stat.size ?? 0));

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    await pipeFile(stat.absolutePath, res);
  } catch (err) {
    let statusCode = 500;
    let message = "Could not read file";

    if (err instanceof FileViewError) {
      statusCode = err.statusCode;
      message = err.message;
    } else if (err instanceof FilesystemError) {
      // Missing files and symlink escapes look the same to the client.
      statusCode = 404;
      message = "File not found";
    } else {
      console.error("File view failed:", err);
    }

    if (res.headersSent) {
      res.destroy();
      return;
    }

    res.statusCode = statusCode;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(message);
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

async function indexCreatedFile(input: {
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

function isReadableTextMime(mimeType: string | null): boolean {
  if (!mimeType) return true;
  return mimeType.startsWith("text/") || mimeType === "application/x-tex";
}

async function fileMimeType(row: FileEntryRow): Promise<string> {
  if (row.mimeType) return row.mimeType;

  try {
    const detected = await detectFileType(row.relativePath);
    return detected.mimeType ?? "application/octet-stream";
  } catch {
    return "application/octet-stream";
  }
}

function parseRangeHeader(
  header: string | undefined,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";

  const [, rawStart, rawEnd] = match;

  let start: number;
  let end: number;

  if (rawStart === "" && rawEnd === "") return "invalid";

  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) return "invalid";
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return "invalid";
  }

  return { start, end: Math.min(end, size - 1) };
}

function pipeFile(
  absolutePath: string,
  res: ServerResponse,
  start?: number,
  end?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(absolutePath, { start, end });

    stream.on("error", (err) => {
      res.destroy();
      reject(err);
    });
    stream.on("end", resolve);
    res.on("close", () => {
      stream.destroy();
      resolve();
    });

    stream.pipe(res);
  });
}
