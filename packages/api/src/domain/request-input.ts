import Busboy from "busboy";
import type { IncomingMessage } from "node:http";
import type { ApiEndpointRow } from "./types";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export class RequestInputError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "RequestInputError";
  }
}

export interface ParsedInvocation {
  state: string;
  files: File[];
  fields: Record<string, unknown>;
}

/** Reads the request body as the task state plus any attached files. */
export async function parseInvocation(
  req: IncomingMessage,
  endpoint: ApiEndpointRow,
): Promise<ParsedInvocation> {
  const contentType = String(req.headers["content-type"] ?? "");

  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    return parseMultipart(req, endpoint);
  }

  const raw = await readLimitedBody(req, MAX_BODY_BYTES);

  if (contentType.toLowerCase().includes("application/json")) {
    let body: unknown;
    try {
      body = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      throw new RequestInputError("Request body is not valid JSON", 400);
    }

    return { state: stateFromValue(body, endpoint), files: [], fields: {} };
  }

  return { state: raw, files: [], fields: {} };
}

/** Reads a JSON request body, rejecting empty or non-JSON payloads. */
export async function readJsonBody(
  req: IncomingMessage,
  limit = MAX_BODY_BYTES,
): Promise<unknown> {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    throw new RequestInputError("Request body must be JSON", 415);
  }

  const raw = await readLimitedBody(req, limit);
  if (!raw.trim()) {
    throw new RequestInputError("Request body is required", 400);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestInputError("Request body is not valid JSON", 400);
  }
}

export function stateFromValue(
  value: unknown,
  endpoint: ApiEndpointRow,
): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";

  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    if (endpoint.stateField) {
      const field = record[endpoint.stateField];
      if (field !== undefined && field !== null) {
        return typeof field === "string"
          ? field
          : JSON.stringify(field, null, 2);
      }
    }

    if (typeof record.state === "string") return record.state;
  }

  return JSON.stringify(value, null, 2);
}

function stateFromFields(
  fields: Record<string, unknown>,
  endpoint: ApiEndpointRow,
): string {
  if (endpoint.stateField && fields[endpoint.stateField] !== undefined) {
    const value = fields[endpoint.stateField];
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  for (const key of ["state", "message", "prompt", "text"]) {
    const value = fields[key];
    if (typeof value === "string") return value;
  }

  return Object.keys(fields).length > 0 ? JSON.stringify(fields, null, 2) : "";
}

async function readLimitedBody(
  req: IncomingMessage,
  limit: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > limit) {
      throw new RequestInputError(`Request body exceeds ${limit} bytes`, 413);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseMultipart(
  req: IncomingMessage,
  endpoint: ApiEndpointRow,
): Promise<ParsedInvocation> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, unknown> = {};
    const files: Promise<File>[] = [];
    let failure: RequestInputError | null = null;

    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          files: MAX_FILES,
          fileSize: MAX_FILE_BYTES,
          fields: 200,
          fieldSize: 1024 * 1024,
        },
      });
    } catch {
      reject(new RequestInputError("Invalid multipart request", 400));
      return;
    }

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      let size = 0;

      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        chunks.push(chunk);
      });

      stream.on("limit", () => {
        failure = new RequestInputError(
          `File "${info.filename}" exceeds ${MAX_FILE_BYTES} bytes`,
          413,
        );
      });

      files.push(
        new Promise<File>((fileResolve) => {
          stream.on("end", () => {
            fileResolve(
              new File(
                [Uint8Array.from(Buffer.concat(chunks))],
                info.filename || "upload",
                {
                  type: info.mimeType || "application/octet-stream",
                },
              ),
            );
          });
        }),
      );

      if (size > MAX_FILE_BYTES) {
        failure = new RequestInputError(
          `File "${info.filename}" exceeds ${MAX_FILE_BYTES} bytes`,
          413,
        );
      }
    });

    busboy.on("filesLimit", () => {
      failure = new RequestInputError(
        `Too many files; the limit is ${MAX_FILES}`,
        413,
      );
    });

    busboy.on("error", () => {
      reject(new RequestInputError("Invalid multipart request", 400));
    });

    busboy.on("close", () => {
      void (async () => {
        try {
          const resolved = await Promise.all(files);
          if (failure) {
            reject(failure);
            return;
          }

          resolve({
            state: stateFromFields(fields, endpoint),
            files: resolved,
            fields,
          });
        } catch (err) {
          reject(err);
        }
      })();
    });

    req.pipe(busboy);
  });
}
