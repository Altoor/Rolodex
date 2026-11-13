/**
 * The GraphQL API and streaming upload route are served from the backend
 * origin, while the web app runs on a different port in development.
 */
export const FILE_API_ORIGIN = "http://localhost:4000";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("auth_token");
}

export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
