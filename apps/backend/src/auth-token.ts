import jwt from "jsonwebtoken";
import { getUser } from "./schema/user/user-service.ts";
import { users } from "./db/index.ts";
import { TOKEN_SECRET } from "./config.ts";

/** Resolves the user from an `Authorization: Bearer <jwt>` header. */
export async function extractUser(
  authHeader: string | null,
): Promise<typeof users.$inferSelect | null> {
  if (!authHeader) return null;

  const token = authHeader.split(" ")[1];
  if (!token) return null;

  try {
    const verified = jwt.verify(token, TOKEN_SECRET);
    if (typeof verified === "string" || !verified.aud) return null;

    return await getUser(parseInt(verified.aud as string));
  } catch {
    return null;
  }
}
