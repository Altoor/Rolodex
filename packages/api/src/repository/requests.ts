import { and, desc, eq } from "drizzle-orm";
import { apiRequests, db } from "@repo/db";
import type { ApiRequestRow } from "../domain/types";
import { isUuid } from "../domain/uuid";

export interface CreateApiRequestInput {
  endpointId: string;
  userId: number;
  runId: string;
  state: string;
}

export async function createApiRequest(
  input: CreateApiRequestInput,
): Promise<ApiRequestRow> {
  const [row] = await db
    .insert(apiRequests)
    .values({
      endpointId: input.endpointId,
      userId: input.userId,
      runId: input.runId,
      state: input.state,
    })
    .returning();

  if (!row) throw new Error("failed to create API request");
  return row;
}

export async function getApiRequest(
  endpointId: string,
  requestId: string,
): Promise<ApiRequestRow | null> {
  if (!isUuid(endpointId) || !isUuid(requestId)) return null;

  const [row] = await db
    .select()
    .from(apiRequests)
    .where(
      and(
        eq(apiRequests.id, requestId),
        eq(apiRequests.endpointId, endpointId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listApiRequests(
  endpointId: string,
  limit = 20,
): Promise<ApiRequestRow[]> {
  return db
    .select()
    .from(apiRequests)
    .where(eq(apiRequests.endpointId, endpointId))
    .orderBy(desc(apiRequests.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}
