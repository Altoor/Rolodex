import { afterEach, describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readApiKey,
  requestOrigin,
  respondJson,
  setCorsHeaders,
} from "./respond";

function request(headers: Record<string, string>): IncomingMessage {
  return { headers, socket: {} } as unknown as IncomingMessage;
}

function response() {
  const headers: Record<string, string> = {};
  const res = {
    headersSent: false,
    statusCode: 0,
    body: "",
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    end(body: string) {
      this.body = body;
    },
    destroy() {},
  };
  return { res: res as unknown as ServerResponse, headers, raw: res };
}

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("readApiKey", () => {
  it("reads X-API-Key and bearer headers", () => {
    expect(readApiKey(request({ "x-api-key": " ak_1 " }), new URL("http://x"))).toBe(
      "ak_1",
    );
    expect(
      readApiKey(request({ authorization: "Bearer ak_2" }), new URL("http://x")),
    ).toBe("ak_2");
  });

  it("ignores ?key= unless the caller allows it", () => {
    const req = request({});
    expect(readApiKey(req, new URL("http://x/?key=ak_3"))).toBeNull();
    expect(
      readApiKey(req, new URL("http://x/?key=ak_3"), { allowQuery: true }),
    ).toBe("ak_3");
  });

  it("prefers headers over the query string", () => {
    const req = request({ authorization: "Bearer header-key" });
    expect(
      readApiKey(req, new URL("http://x/?key=query-key"), { allowQuery: true }),
    ).toBe("header-key");
  });
});

describe("requestOrigin", () => {
  it("uses API_PUBLIC_ORIGIN and strips trailing slashes", () => {
    process.env.API_PUBLIC_ORIGIN = "https://api.example.com/";
    expect(requestOrigin(request({ host: "evil.test" }))).toBe(
      "https://api.example.com",
    );
  });

  it("falls back to a validated host when no public origin is set", () => {
    delete process.env.API_PUBLIC_ORIGIN;
    expect(requestOrigin(request({ host: "api.example.com:4000" }))).toBe(
      "http://api.example.com:4000",
    );
    expect(requestOrigin(request({ host: "bad host/<script>" }))).toBe(
      "http://localhost:4000",
    );
  });
});

describe("setCorsHeaders", () => {
  it("does not reflect arbitrary origins without an allowlist", () => {
    delete process.env.API_CORS_ORIGINS;
    const { res, headers } = response();
    setCorsHeaders(request({ origin: "https://evil.test" }), res);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("reflects only allowlisted origins", () => {
    process.env.API_CORS_ORIGINS = "https://app.test, https://admin.test";
    const allowed = response();
    setCorsHeaders(request({ origin: "https://app.test" }), allowed.res);
    expect(allowed.headers["Access-Control-Allow-Origin"]).toBe(
      "https://app.test",
    );

    const denied = response();
    setCorsHeaders(request({ origin: "https://evil.test" }), denied.res);
    expect(denied.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it('treats a "*" entry as an explicit opt-in', () => {
    process.env.API_CORS_ORIGINS = "*";
    const { res, headers } = response();
    setCorsHeaders(request({ origin: "https://any.test" }), res);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://any.test");
  });
});

describe("respondJson", () => {
  it("serialises JSON with the right content type", () => {
    const { res, headers, raw } = response();
    respondJson(res, 201, { ok: true });
    expect(raw.statusCode).toBe(201);
    expect(headers["Content-Type"]).toContain("application/json");
    expect(raw.body).toBe(JSON.stringify({ ok: true }));
  });
});
