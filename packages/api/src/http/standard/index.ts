import type { ApiRoute } from "../route-types";
import { createTodoUpdateRoute, createTodosListRoute } from "./todos-routes";

/**
 * Standard, user-scoped routes mounted under `/api/v1`. They reuse endpoint
 * keys for authentication and are separate from the `/api/hooks` flow surface.
 */
export function createStandardRoutes(): ApiRoute[] {
  return [createTodosListRoute(), createTodoUpdateRoute()];
}
