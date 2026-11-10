import {
  and,
  cosineDistance,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { db } from "../../schema/builder";
import { todos } from "../../db";
import { tryEmbedText } from "../../ai/embeddings";
import { getDecisionModelForUser } from "../../ai/model";
import {
  mergeToolInput,
  readBoolean,
  readNumber,
  readString,
} from "../input";
import { ToolInputError, type ToolRunContext } from "../types";
import { selectTodoWithDecision } from "./selection";

type TodoRow = typeof todos.$inferSelect;

export interface TodoCandidate {
  id: number;
  name: string;
  description: string;
  done: boolean;
  doByDate: string | null;
  createdAt: string | null;
  archivedAt: string | null;
  score: number;
}

export interface TodoMatches {
  /** Highest-scoring candidate. */
  todo: TodoCandidate;
  /** All candidates, in the order returned by the search strategy. */
  candidates: TodoCandidate[];
}

/**
 * Reads an id from a tool-state payload shaped like `{ todo }`,
 * `{ todos: [...] }`, or `{ id }`. This keeps selection working even though
 * tool state no longer carries a separate `data` block.
 */
function readEmbeddedTodoId(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return value.length > 0 ? readEmbeddedTodoId(value[0]) : undefined;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return readNumber(record, "id") ?? readNumber(record, "todoId");
  }

  return undefined;
}

async function listUserTodos(
  userId: number,
  includeArchived: boolean,
): Promise<TodoRow[]> {
  return db.query.todos.findMany({
    where: {
      OR: [{ authorId: userId }, { actorId: userId }],
      ...(includeArchived ? {} : { archivedAt: { isNull: true } }),
    },
  });
}

async function loadUserTodo(userId: number, id: number): Promise<TodoRow> {
  const todo = await db.query.todos.findFirst({
    where: {
      AND: [{ OR: [{ authorId: userId }, { actorId: userId }] }, { id }],
    },
  });

  if (!todo) {
    throw new ToolInputError(`todo ${id} not found`);
  }

  return todo;
}

/**
 * Resolves todo candidates with the same strategy used by the find_todo tool:
 * explicit id, vector search, lexical fallback, then the decision-model
 * selector. Callers that only need a mutation target can use `todo`; the
 * find_todo tool also exposes the candidate list.
 */
export async function findTodoMatches(
  context: ToolRunContext,
  options: { includeArchived?: boolean } = {},
): Promise<TodoMatches> {
  const input = mergeToolInput(context);
  const includeArchived =
    options.includeArchived ??
    readBoolean(input, "includeArchived") ??
    false;
  const explicitId =
    readNumber(input, "id") ??
    readNumber(input, "todoId") ??
    readEmbeddedTodoId(input.todo) ??
    readEmbeddedTodoId(input.todos);

  if (explicitId !== undefined) {
    const todo = await loadUserTodo(context.userId, explicitId);
    return {
      todo: {
        id: todo.id,
        name: todo.name,
        description: todo.description,
        done: todo.done,
        doByDate: todo.doByDate?.toISOString() ?? null,
        createdAt: todo.createdAt?.toISOString() ?? null,
        archivedAt: todo.archivedAt?.toISOString() ?? null,
        score: 1,
      },
      candidates: [],
    };
  }

  const queryText = readString(input, "query") ?? context.state;
  if (!queryText || !queryText.trim()) {
    throw new ToolInputError("todo lookup requires a query or state");
  }

  const limit = Math.max(1, Math.floor(readNumber(input, "limit") ?? 5));

  const ownership = or(
    eq(todos.authorId, context.userId),
    eq(todos.actorId, context.userId),
  );

  const queryEmbedding = await tryEmbedText(queryText);
  let candidates: TodoCandidate[] = [];

  if (queryEmbedding) {
    const distance = cosineDistance(todos.descriptionEmbedding, queryEmbedding);

    const rows = await db
      .select({
        id: todos.id,
        name: todos.name,
        description: todos.description,
        done: todos.done,
        doByDate: todos.doByDate,
        createdAt: todos.createdAt,
        archivedAt: todos.archivedAt,
        distance,
      })
      .from(todos)
      .where(
        and(
          ownership,
          isNotNull(todos.descriptionEmbedding),
          includeArchived ? undefined : isNull(todos.archivedAt),
        ),
      )
      .orderBy(distance)
      .limit(limit);

    candidates = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      done: row.done,
      doByDate: row.doByDate?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      score: 1 - Number(row.distance),
    }));
  }

  if (candidates.length === 0) {
    const pattern = `%${queryText}%`;
    const rows = await db
      .select({
        id: todos.id,
        name: todos.name,
        description: todos.description,
        done: todos.done,
        doByDate: todos.doByDate,
        createdAt: todos.createdAt,
        archivedAt: todos.archivedAt,
      })
      .from(todos)
      .where(
        and(
          ownership,
          includeArchived ? undefined : isNull(todos.archivedAt),
          or(ilike(todos.name, pattern), ilike(todos.description, pattern)),
        ),
      )
      .limit(limit);

    candidates = rows.map((row) => ({
      ...row,
      doByDate: row.doByDate?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      score: 1,
    }));
  }

  if (candidates.length === 0) {
    const model =
      readString(input, "decisionModel") ??
      readString(input, "model") ??
      context.decisionModel ??
      (await getDecisionModelForUser(context.userId));

    const userTodos = await listUserTodos(context.userId, includeArchived);
    if (userTodos.length === 0) {
      throw new ToolInputError("no matching todo found");
    }

    const selected = await selectTodoWithDecision(userTodos, queryText, model);

    candidates = [
      {
        id: selected.id,
        name: selected.name,
        description: selected.description,
        done: selected.done,
        doByDate: selected.doByDate?.toISOString() ?? null,
        createdAt: selected.createdAt?.toISOString() ?? null,
        archivedAt: selected.archivedAt?.toISOString() ?? null,
        score: 1,
      },
    ];
  }

  let best = candidates[0];
  if (!best) {
    throw new ToolInputError("no matching todo found");
  }

  for (const candidate of candidates.slice(1)) {
    if (candidate.score > best.score) {
      best = candidate;
    }
  }

  return { todo: best, candidates };
}
