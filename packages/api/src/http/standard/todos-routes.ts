import { readJsonBody } from "../../domain/request-input";
import {
  parseTodoId,
  parseTodoListQuery,
  parseTodoUpdate,
} from "../../domain/todos";
import { listTodos, setTodoDone } from "../../repository/todos";
import { HttpError, respondJson } from "../respond";
import type { ApiRoute } from "../route-types";
import { authenticateStandardRequest } from "./auth";

/** GET /api/v1/todos — the caller's todos, due-date ordered and paginated. */
export function createTodosListRoute(): ApiRoute {
  return {
    method: "GET",
    path: "/api/v1/todos",
    async handle({ req, res, url }) {
      const { userId } = await authenticateStandardRequest(req, url);
      const query = parseTodoListQuery(url.searchParams);
      const page = await listTodos(userId, query);

      const nextOffset = query.offset + page.items.length;
      const hasMore = nextOffset < page.total;

      respondJson(res, 200, {
        items: page.items,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: page.total,
          hasMore,
          nextOffset: hasMore ? nextOffset : null,
        },
      });
    },
  };
}

/** PATCH /api/v1/todos/:id — mark a todo done or not done. */
export function createTodoUpdateRoute(): ApiRoute {
  return {
    method: "PATCH",
    path: "/api/v1/todos/:id",
    async handle({ req, res, url, params }) {
      const { userId } = await authenticateStandardRequest(req, url);
      const id = parseTodoId(params.id);
      const update = parseTodoUpdate(await readJsonBody(req));
      const todo = await setTodoDone(userId, id, update.done);

      if (!todo) throw new HttpError("Todo not found", 404);

      respondJson(res, 200, { todo });
    },
  };
}
