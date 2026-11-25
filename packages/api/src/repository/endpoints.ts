import { and, desc, eq } from "drizzle-orm";
import { apiEndpoints, db } from "@repo/db";
import { generateApiKey, generateEndpointSlug } from "../domain/keys";
import {
  EndpointSlugConflictError,
  isUniqueViolation,
  normalizeCustomEndpointSlug,
} from "../domain/slug";
import { isUuid } from "../domain/uuid";
import type {
  ApiEndpointInput,
  ApiEndpointRow,
  ApiEndpointUpdate,
  CreatedApiEndpoint,
} from "../domain/types";
import { assertTaskVisibleToUser } from "./task-visibility";

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
  if (!isUuid(id)) return null;

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

/** Resolves the owner of an enabled key hash for the standard API surface. */
export async function findApiKeyOwner(
  keyHash: string,
): Promise<{ endpointId: string; userId: number } | null> {
  const [row] = await db
    .select({
      endpointId: apiEndpoints.id,
      userId: apiEndpoints.userId,
    })
    .from(apiEndpoints)
    .where(
      and(eq(apiEndpoints.keyHash, keyHash), eq(apiEndpoints.enabled, true)),
    )
    .limit(1);

  return row ?? null;
}

export async function createApiEndpoint(
  userId: number,
  input: ApiEndpointInput,
): Promise<CreatedApiEndpoint> {
  await assertTaskVisibleToUser(userId, input.taskId);

  const key = generateApiKey();
  const requestedSlug = input.slug?.trim();
  const slug = requestedSlug
    ? normalizeCustomEndpointSlug(requestedSlug)
    : generateEndpointSlug();

  if (requestedSlug) {
    await assertSlugAvailable(slug);
  }

  let row: ApiEndpointRow | undefined;
  try {
    [row] = await db
      .insert(apiEndpoints)
      .values({
        userId,
        name: input.name,
        description: input.description ?? "",
        slug,
        taskId: input.taskId,
        stateField: normalizeStateField(input.stateField),
        keyHash: key.keyHash,
        keyPrefix: key.keyPrefix,
        keyLastFour: key.keyLastFour,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) throw slugConflict(slug);
    throw err;
  }

  if (!row) throw new Error("failed to create API endpoint");
  return { endpoint: row, apiKey: key.apiKey };
}

export async function updateApiEndpoint(
  userId: number,
  id: string,
  update: ApiEndpointUpdate,
): Promise<ApiEndpointRow | null> {
  if (update.taskId !== undefined) {
    await assertTaskVisibleToUser(userId, update.taskId);
  }
  if (!isUuid(id)) return null;

  const values: Partial<typeof apiEndpoints.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (update.name !== undefined) values.name = update.name;
  if (update.description !== undefined) {
    values.description = update.description;
  }
  if (update.slug !== undefined) {
    values.slug = normalizeCustomEndpointSlug(update.slug);
    await assertSlugAvailable(values.slug, id);
  }
  if (update.taskId !== undefined) values.taskId = update.taskId;
  if (update.stateField !== undefined) {
    values.stateField = normalizeStateField(update.stateField);
  }
  if (update.enabled !== undefined) values.enabled = update.enabled;

  let row: ApiEndpointRow | undefined;
  try {
    [row] = await db
      .update(apiEndpoints)
      .set(values)
      .where(and(eq(apiEndpoints.id, id), eq(apiEndpoints.userId, userId)))
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) throw slugConflict(values.slug ?? "");
    throw err;
  }

  return row ?? null;
}

export async function rotateApiEndpointKey(
  userId: number,
  id: string,
): Promise<CreatedApiEndpoint | null> {
  if (!isUuid(id)) return null;

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
  if (!isUuid(id)) return false;

  const rows = await db
    .delete(apiEndpoints)
    .where(and(eq(apiEndpoints.id, id), eq(apiEndpoints.userId, userId)))
    .returning({ id: apiEndpoints.id });

  return rows.length > 0;
}

async function assertSlugAvailable(
  slug: string,
  excludeId?: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: apiEndpoints.id })
    .from(apiEndpoints)
    .where(eq(apiEndpoints.slug, slug))
    .limit(1);

  if (existing && existing.id !== excludeId) throw slugConflict(slug);
}

function slugConflict(slug: string): EndpointSlugConflictError {
  return new EndpointSlugConflictError(
    slug
      ? `The URL "/api/hooks/${slug}" is already in use`
      : "That endpoint URL is already in use",
  );
}

function normalizeStateField(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
