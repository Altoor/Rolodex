import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PREFIX = "ak_";

export interface GeneratedApiKey {
  apiKey: string;
  keyHash: string;
  keyPrefix: string;
  keyLastFour: string;
}

/** Creates a random API secret plus the pieces stored for display/verification. */
export function generateApiKey(): GeneratedApiKey {
  const apiKey = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;

  return {
    apiKey,
    keyHash: hashApiKey(apiKey),
    keyPrefix: apiKey.slice(0, 10),
    keyLastFour: apiKey.slice(-4),
  };
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/** Constant-time comparison of a presented key against the stored hash. */
export function apiKeyMatches(apiKey: string, storedHash: string): boolean {
  const presented = Buffer.from(hashApiKey(apiKey), "hex");
  const stored = Buffer.from(storedHash, "hex");

  return (
    presented.length === stored.length && timingSafeEqual(presented, stored)
  );
}

/** Random, URL-safe endpoint identifier. */
export function generateEndpointSlug(): string {
  return randomBytes(16).toString("base64url");
}
