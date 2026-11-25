import type { IncomingMessage } from "node:http";
import { hashApiKey } from "../../domain/keys";
import { findApiKeyOwner } from "../../repository/endpoints";
import { findStandardKeyOwner } from "../../repository/standard-keys";
import { HttpError, readApiKey } from "../respond";

export interface StandardAuth {
  userId: number;
  /** Present when the request authenticated with an endpoint key. */
  endpointId: string | null;
  keySource: "standard" | "endpoint";
}

/**
 * Authenticates a standard API call with the user's dedicated standard key or
 * any enabled endpoint key. The key's owning user scopes every resource.
 */
export async function authenticateStandardRequest(
  req: IncomingMessage,
  url: URL,
): Promise<StandardAuth> {
  const key = readApiKey(req, url);
  if (!key) throw new HttpError("Invalid API key", 401);

  const keyHash = hashApiKey(key);

  const standardOwner = await findStandardKeyOwner(keyHash);
  if (standardOwner) {
    return {
      userId: standardOwner.userId,
      endpointId: null,
      keySource: "standard",
    };
  }

  const endpointOwner = await findApiKeyOwner(keyHash);
  if (endpointOwner) {
    return {
      userId: endpointOwner.userId,
      endpointId: endpointOwner.endpointId,
      keySource: "endpoint",
    };
  }

  throw new HttpError("Invalid API key", 401);
}
