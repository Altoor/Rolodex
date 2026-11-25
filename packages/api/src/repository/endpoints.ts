import { and, desc, eq } from "drizzle-orm";
import { apiEndpoints, db } from "@repo/db";
import {
  generateApiKey,
  generateEndpointSlug,
} from "../domain/keys";
import type {
  ApiEndpointInput,
  ApiEndpointRow,
  ApiEndpointUpdate,
  CreatedApiEndpoint,
} from "../domain/types";

export async function listApiEndpoints(
  userId: number,
): Promise<ApiEndpointRow[]> {
  return db
    .select()
    .from(apiEndpoints)
    .where(eq(apiEndpoints.userId, userId))
    .orderBy(desc(apiEndpoints.createdAt));
}

export async function getApiEndpoint(
  userId: number,
  id: string,
): Promise<ApiEndpointRow | null> {
  const [row] = await db
    .select()
    .from(apiEndpoints)
    .where(and(eq(apiEndpoints.id, id), eq(apiEndpoints.userId, userId)))
    .limit(1);

  return row ?? null;
}

export async function findApiEndpointBySlug(
  slug: string,
): Promise<ApiEndpointRow | null> {
  const [row] = await db
    .select()
    .from(apiEndpoints)
    .where(eq(apiEndpoints.slug, slug))
    .limit(1);

  return row ?? null;
}

export async function createApiEndpoint(
  userId: number,
  input: ApiEndpointInput,
): Promise<CreatedApiEndpoint> {
  const key = generateApiKey();
  const [row] = await db
    .insert(apiEndpoints)
    .values({
      userId,
      name: input.name,
      description: input.description ?? "",
      slug: generateEndpointSlug(),
      taskId: input.taskId,
      stateField: normalizeStateField(input.stateField),
      keyHash: key.keyHash,
      keyPrefix: key.keyPrefix,
      keyLastFour: key.keyLastFour,
    })
    .returning();

  if (!row) throw new Error("failed to create API endpoint");
  return { endpoint: row, apiKey: key.apiKey };
}

export async function updateApiEndpoint(
  userId: number,
  id: string,
  update: ApiEndpointUpdate,
): Promise<ApiEndpointRow | null> {
  const values: Partial<typeof apiEndpoints.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (update.name !== undefined) values.name = update.name;
  if (update.description !== undefined) {
    values.description = update.description;
  }
  if (update.taskId !== undefined) values.taskId = update.taskId;
  if (update.stateField !== undefined) {
    values.stateField = normalizeStateField(update.stateField);
  }
  if (update.enabled !== undefined) values.enabled = update.enabled;

  const [row] = await db
    .update(apiEndpoints)
    .set(values)
    .where(and(eq(apiEndpoints.id, id), eq(apiEndpoints.userId, userId)))
    .returning();

  return row ?? null;
}

export async function rotateApiEndpointKey(
  userId: number,
  id: string,
): Promise<CreatedApiEndpoint | null> {
  const key = generateApiKey();
  const [row] = await db
    .update(apiEndpoints)
    .set({
      keyHash: key.keyHash,
      keyPrefix: key.keyPrefix,
      keyLastFour: key.keyLastFour,
      updatedAt: new Date(),
    })
    .where(and(eq(apiEndpoints.id, id), eq(apiEndpoints.userId, userId)))
    .returning();

  return row ? { endpoint: row, apiKey: key.apiKey } : null;
}

export async function deleteApiEndpoint(
  userId: number,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(apiEndpoints)
    .where(and(eq(apiEndpoints.id, id), eq(apiEndpoints.userId, userId)))
    .returning({ id: apiEndpoints.id });

  return rows.length > 0;
}

function normalizeStateField(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
