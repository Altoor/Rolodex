import type { IncomingMessage } from "node:http";
import { apiKeyMatches } from "../domain/keys";
import type { ApiEndpointRow } from "../domain/types";
import { findApiEndpointBySlug } from "../repository/endpoints";
import { HttpError, readApiKey } from "./respond";

/** Resolves an enabled endpoint and verifies the presented API key. */
export async function authenticateEndpoint(
  req: IncomingMessage,
  url: URL,
  slug: string,
): Promise<ApiEndpointRow> {
  const endpoint = await findApiEndpointBySlug(slug);
  if (!endpoint || !endpoint.enabled) {
    throw new HttpError("Unknown API endpoint", 404);
  }

  const key = readApiKey(req, url);
  if (!key || !apiKeyMatches(key, endpoint.keyHash)) {
    throw new HttpError("Invalid API key", 401);
  }

  return endpoint;
}
