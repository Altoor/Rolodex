import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import type { ApiEndpointRow } from "./types";
import { parseInvocation, stateFromValue } from "./request-input";

const endpoint = {
  stateField: null,
} as ApiEndpointRow;

function multipartRequest(files: Buffer[]): IncomingMessage {
  const boundary = "----rolodex-test-boundary";
  const chunks: Buffer[] = [];

  for (const [index, file] of files.entries()) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="f${index}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      file,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(chunks);
  const req = Readable.from(body) as unknown as IncomingMessage;
  (req as { headers: Record<string, string> }).headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length),
  };
  return req;
}

describe("stateFromValue", () => {
  it("uses a string body verbatim", () => {
    expect(stateFromValue("hello", endpoint)).toBe("hello");
  });

  it("pretty-prints an object body", () => {
    expect(stateFromValue({ a: 1 }, endpoint)).toBe(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });

  it("uses a top-level state string before serialising", () => {
    expect(stateFromValue({ state: "prompt", other: 1 }, endpoint)).toBe(
      "prompt",
    );
  });

  it("picks a configured state field", () => {
    const configured = { stateField: "message" } as ApiEndpointRow;

    expect(stateFromValue({ message: "chosen", state: "ignored" }, configured))
      .toBe("chosen");
  });

  it("serialises non-string configured fields", () => {
    const configured = { stateField: "payload" } as ApiEndpointRow;

    expect(stateFromValue({ payload: { a: 1 } }, configured)).toBe(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });

  it("returns an empty state for null", () => {
    expect(stateFromValue(null, endpoint)).toBe("");
  });
});

describe("parseInvocation multipart limits", () => {
  it("rejects a request whose files exceed the total byte cap", async () => {
    const file = Buffer.alloc(17 * 1024 * 1024, 1);
    const req = multipartRequest([file, file, file]);

    await expect(parseInvocation(req, endpoint)).rejects.toThrow(
      /Request body exceeds/,
    );
  });

  it("accepts small multipart bodies", async () => {
    const req = multipartRequest([Buffer.from("hello")]);
    const parsed = await parseInvocation(req, endpoint);

    expect(parsed.files).toHaveLength(1);
    expect(await parsed.files[0]?.text()).toBe("hello");
  });
});

