import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GraphQLError } from "graphql";
import { extractUser } from "../../auth-token";
import { toFileEntryRef } from "@repo/tools/tools/file/services/dto";
import { ensureTempDirectory } from "@repo/tools/tools/file/services/storage";
import {
  joinRelativePath,
  resolveFilesPath,
} from "@repo/tools/tools/file/services/paths";
import { completeStreamedUpload, resolveUploadParent } from "./file-service";

const MAX_UPLOAD_BYTES = readMaxUploadBytes();
const TEMP_DIR = ".tmp";

class UploadError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Streaming upload endpoint: POST /files/upload?name=<name>&parentId=<id>
 *
 * The raw request body is the file. This bypasses GraphQL multipart so a
 * multi-GB upload never has to be buffered in memory.
 */
export async function handleFileUploadRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  setCorsHeaders(req, res);

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== "POST") {
      throw new UploadError("Use POST to upload a file", 405);
    }

    const user = await extractUser(req.headers.authorization ?? null);
    if (!user) throw new UploadError("Not logged in", 401);

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const originalName =
      url.searchParams.get("name") ??
      (typeof req.headers["x-file-name"] === "string"
        ? req.headers["x-file-name"]
        : null);

    if (!originalName || !originalName.trim()) {
      throw new UploadError('"name" is required', 400);
    }

    const parentId = parseParentId(url.searchParams.get("parentId"));
    await resolveUploadParent(parentId);

    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
      throw new UploadError(
        `file is ${declaredLength} bytes; the limit is ${MAX_UPLOAD_BYTES}`,
        413,
      );
    }

    await ensureTempDirectory();
    const tempRelativePath = joinRelativePath(TEMP_DIR, randomUUID());
    const tempAbsolutePath = resolveFilesPath(tempRelativePath);

    let receivedBytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        receivedBytes += chunk.length;

        if (receivedBytes > MAX_UPLOAD_BYTES) {
          callback(
            new UploadError(
              `file exceeds the ${MAX_UPLOAD_BYTES}-byte limit`,
              413,
            ),
          );
          return;
        }

        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        req,
        limiter,
        createWriteStream(tempAbsolutePath, { flags: "wx" }),
      );
    } catch (err) {
      await fs.rm(tempAbsolutePath, { force: true }).catch(() => undefined);
      throw err;
    }

    try {
      const row = await completeStreamedUpload({
        tempRelativePath,
        originalName,
        parentId,
      });

      respondJson(res, 201, { file: toFileEntryRef(row) });
    } catch (err) {
      await fs.rm(tempAbsolutePath, { force: true }).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    let statusCode = 500;
    let message = "Upload failed";

    if (err instanceof UploadError) {
      statusCode = err.statusCode;
      message = err.message;
    } else if (err instanceof GraphQLError) {
      const code = err.extensions?.code;
      statusCode = code === "NOT_FOUND" ? 404 : 400;
      message = err.message;
    } else {
      // Do not echo filesystem errors: they can contain absolute paths.
      console.error("File upload failed:", err);
    }

    respondJson(res, statusCode, { error: message });
  }
}

function readMaxUploadBytes(): number {
  const configured = Number(process.env.MAX_STREAM_UPLOAD_BYTES);

  if (Number.isFinite(configured) && configured > 0) return configured;

  // Multi-GB media is expected; disk space is the practical limit.
  return 10 * 1024 * 1024 * 1024;
}

function parseParentId(value: string | null): number | null {
  if (value === null || value === "") return null;

  const id = Number(value);
  if (!Number.isInteger(id)) {
    throw new UploadError('"parentId" must be an integer', 400);
  }

  return id;
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  // The web app runs on a different port in development and calls this route
  // with fetch(), so the preflight response must allow the auth header.
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-File-Name",
  );
}

function respondJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
