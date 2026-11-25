import type { IncomingMessage } from "node:http";
import { hashApiKey } from "../../domain/keys";
import { findStandardKeyOwner } from "../../repository/standard-keys";
import { HttpError, readApiKey } from "../respond";

export interface StandardAuth {
  userId: number;
  keySource: "standard";
}

/**
 * Authenticates a standard API call with the user's dedicated standard key.
 *
 * Endpoint keys are intentionally rejected here: they are scoped to a single
 * hook and must not grant account-wide access to todos. Query-string keys are
 * also rejected; only WebSocket upgrades may use `?key=`.
 */
export async function authenticateStandardRequest(
  req: IncomingMessage,
  url: URL,
): Promise<StandardAuth> {
  const key = readApiKey(req, url);
  if (!key) throw new HttpError("Invalid API key", 401);

  const standardOwner = await findStandardKeyOwner(hashApiKey(key));
  if (!standardOwner) throw new HttpError("Invalid API key", 401);

  return { userId: standardOwner.userId, keySource: "standard" };
}
