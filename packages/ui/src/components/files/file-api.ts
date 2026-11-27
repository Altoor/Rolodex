/**
 * Auth helpers for the streaming upload/download routes. The backend origin is
 * supplied by `useApiOrigin()` at call time so `API_PUBLIC_ORIGIN` is applied
 * at runtime rather than baked into the client bundle.
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("auth_token");
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
