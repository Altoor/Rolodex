import type { ApiRoute } from "./route-types";
import { respondJson } from "./respond";

/** GET /api/health — unauthenticated liveness probe. */
export function createHealthRoute(): ApiRoute {
  return {
    method: "GET",
    path: "/api/health",
    handle({ res }) {
      respondJson(res, 200, { ok: true });
    },
  };
}
