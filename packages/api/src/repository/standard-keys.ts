import { eq } from "drizzle-orm";
import { db, standardApiKeys } from "@repo/db";
import { generateApiKey } from "../domain/keys";
import type { CreatedStandardApiKey, StandardApiKeyRow } from "../domain/types";

/** Returns the user's standard key metadata, if they have created one. */
export async function getStandardApiKey(
  userId: number,
): Promise<StandardApiKeyRow | null> {
  const [row] = await db
    .select()
    .from(standardApiKeys)
    .where(eq(standardApiKeys.userId, userId))
    .limit(1);

  return row ?? null;
}

/** Resolves the owner of a presented standard key hash. */
export async function findStandardKeyOwner(
  keyHash: string,
): Promise<{ userId: number } | null> {
  const [row] = await db
    .select({ userId: standardApiKeys.userId })
    .from(standardApiKeys)
    .where(eq(standardApiKeys.keyHash, keyHash))
    .limit(1);

  return row ?? null;
}

/** Creates or replaces the user's standard key and returns the plaintext once. */
export async function rotateStandardApiKey(
  userId: number,
): Promise<CreatedStandardApiKey> {
  const key = generateApiKey();
  const now = new Date();

  const [row] = await db
    .insert(standardApiKeys)
    .values({
      userId,
      keyHash: key.keyHash,
      keyPrefix: key.keyPrefix,
      keyLastFour: key.keyLastFour,
    })
    .onConflictDoUpdate({
      target: standardApiKeys.userId,
      set: {
        keyHash: key.keyHash,
        keyPrefix: key.keyPrefix,
        keyLastFour: key.keyLastFour,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new Error("failed to rotate standard API key");
  return { standardApiKey: row, apiKey: key.apiKey };
}
