import type {
  ApiEndpointsQuery,
  ApiRequestsQuery,
} from "@repo/queries/__generated__/graphql";
import { API_ORIGIN } from "#lib/apiOrigin";

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

export function invokeUrl(slug: string | null): string {
  return `${API_ORIGIN}/api/hooks/${slug ?? "<slug>"}`;
}

export function statusUrl(slug: string | null): string {
  return `${invokeUrl(slug)}/requests/{requestId}`;
}

export function websocketUrl(slug: string | null): string {
  return `${invokeUrl(slug).replace(/^http/, "ws")}/ws`;
}

/** Base URL for the standard, user-scoped API namespace. */
export function standardApiUrl(path: string): string {
  return `${API_ORIGIN}/api/v1${path}`;
}

export function formatApiDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}
