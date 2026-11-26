import type {
  ApiEndpointsQuery,
  ApiRequestsQuery,
} from "@repo/queries/__generated__/graphql";

export type ApiEndpoint = NonNullable<
  NonNullable<ApiEndpointsQuery["apiEndpoints"]>[number]
>;

export type ApiRequest = NonNullable<
  NonNullable<ApiRequestsQuery["apiRequests"]>[number]
>;

export interface TaskOption {
  id: number | null;
  name: string | null;
}

export interface RevealedKey {
  apiKey: string;
  endpointName: string;
}

export function invokeUrl(apiOrigin: string, slug: string | null): string {
  return `${apiOrigin}/api/hooks/${slug ?? "<slug>"}`;
}

export function statusUrl(apiOrigin: string, slug: string | null): string {
  return `${invokeUrl(apiOrigin, slug)}/requests/{requestId}`;
}

export function websocketUrl(apiOrigin: string, slug: string | null): string {
  return `${invokeUrl(apiOrigin, slug).replace(/^http/, "ws")}/ws`;
}

/** Base URL for the standard, user-scoped API namespace. */
export function standardApiUrl(apiOrigin: string, path: string): string {
  return `${apiOrigin}/api/v1${path}`;
}

export function formatApiDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}
