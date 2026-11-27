import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import jwt from "jsonwebtoken";
import { TOKEN_SECRET } from "../../config";
import { getUser } from "../user/user-service";
import { statEntry } from "@repo/tools/tools/file/services/storage";
import {
  FilesystemError,
  assertRealPathInsideRoot,
} from "@repo/tools/tools/file/services/paths";
import { detectFileType } from "@repo/tools/tools/file/services/type";
import {
  getFileEntryById,
  type FileEntryRow,
} from "@repo/tools/tools/file/services/entry";
import { FileViewError, badInput } from "./file-errors";
import { requireLiveEntry } from "./file-entry-service";

const VIEW_TOKEN_TTL_MS = 5 * 60 * 1000;

export async function createFileViewTokenForApi(
  userId: number,
  id: number,
): Promise<{ url: string; expiresAt: Date }> {
  const row = await requireLiveEntry(id, userId);

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

  const row = await getFileEntryById(id, { viewerId: payload.sub });
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

  if (rawStart === "" && rawEnd === "") return "invalid";

  let start: number;
  let end: number;

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
