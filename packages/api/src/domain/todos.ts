import { RequestInputError } from "./request-input";

/** How todos are filtered by their `done` flag. */
export type TodoDoneFilter = "all" | boolean;

export interface TodoListQuery {
  done: TodoDoneFilter;
  includeArchived: boolean;
  limit: number;
  offset: number;
}

export interface TodoUpdate {
  done: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function readBooleanParam(
  params: URLSearchParams,
  name: string,
  fallback: boolean,
): boolean {
  const value = params.get(name);
  if (value == null || value.trim() === "") return fallback;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;

  throw new RequestInputError(`"${name}" must be true or false`, 400);
}

function readIntegerParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = params.get(name);
  if (value == null || value.trim() === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RequestInputError(
      `"${name}" must be an integer between ${min} and ${max}`,
      400,
    );
  }

  return parsed;
}

function readDoneFilter(params: URLSearchParams): TodoDoneFilter {
  const value = params.get("done");
  if (value == null || value.trim() === "") return "all";

  switch (value.trim().toLowerCase()) {
    case "all":
      return "all";
    case "true":
    case "1":
    case "done":
      return true;
    case "false":
    case "0":
    case "notdone":
    case "not_done":
    case "open":
      return false;
    default:
      throw new RequestInputError(
        '"done" must be "all", "true", or "false"',
        400,
      );
  }
}

/**
 * Parses the standard todo-list query string. Defaults to all todos, newest
 * due date first, with a small page size so a first request stays cheap.
 */
export function parseTodoListQuery(params: URLSearchParams): TodoListQuery {
  return {
    done: readDoneFilter(params),
    includeArchived: readBooleanParam(params, "includeArchived", false),
    limit: readIntegerParam(params, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: readIntegerParam(params, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** Parses the mutable fields of a standard todo update request. */
export function parseTodoUpdate(value: unknown): TodoUpdate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RequestInputError("Request body must be a JSON object", 400);
  }

  const record = value as Record<string, unknown>;
  if (typeof record.done !== "boolean") {
    throw new RequestInputError('"done" must be a boolean', 400);
  }

  return { done: record.done };
}

/** Parses a todo id from a route parameter. */
export function parseTodoId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new RequestInputError("Todo id must be a positive integer", 400);
  }
  return id;
}
