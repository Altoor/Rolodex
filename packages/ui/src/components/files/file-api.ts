/**
 * The streaming upload/download routes share the backend origin with GraphQL.
 * Resolve it once in `#lib/apiOrigin` so every client entry point agrees.
 */
export { API_ORIGIN as FILE_API_ORIGIN } from "#lib/apiOrigin";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("auth_token");
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
