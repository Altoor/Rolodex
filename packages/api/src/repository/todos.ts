import { and, asc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, todos } from "@repo/db";
import type { TodoListQuery } from "../domain/todos";

export interface TodoDto {
  id: number;
  name: string;
  description: string;
  done: boolean;
  doByDate: string | null;
  createdAt: string;
  archivedAt: string | null;
  authorId: number;
  actorId: number;
}

export interface TodoPage {
  items: TodoDto[];
  total: number;
}

/** Serialises a todo row without leaking the description embedding. */
export function toTodoDto(row: typeof todos.$inferSelect): TodoDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    done: row.done,
    doByDate: row.doByDate ? row.doByDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    authorId: row.authorId,
    actorId: row.actorId,
  };
}

function ownedBy(userId: number, query: TodoListQuery): SQL | undefined {
  const conditions: Array<SQL | undefined> = [
    or(eq(todos.actorId, userId), eq(todos.authorId, userId)),
  ];

  if (query.done !== "all") conditions.push(eq(todos.done, query.done));
  if (!query.includeArchived) conditions.push(isNull(todos.archivedAt));

  return and(...conditions);
}

/**
 * Lists a user's todos in due-date order. Null due dates sort last so dated
 * work stays at the top, and `id` keeps the order stable across pages.
 */
export async function listTodos(
  userId: number,
  query: TodoListQuery,
): Promise<TodoPage> {
  const where = ownedBy(userId, query);

  const [rows, [counted]] = await Promise.all([
    db
      .select()
      .from(todos)
      .where(where)
      .orderBy(sql`${todos.doByDate} asc nulls last`, asc(todos.id))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(todos)
      .where(where),
  ]);

  return { items: rows.map(toTodoDto), total: counted?.total ?? 0 };
}

/** Marks a todo done or not done, scoped to its owner. */
export async function setTodoDone(
  userId: number,
  id: number,
  done: boolean,
): Promise<TodoDto | null> {
  const [row] = await db
    .update(todos)
    .set({ done })
    .where(
      and(
        eq(todos.id, id),
        or(eq(todos.actorId, userId), eq(todos.authorId, userId)),
      ),
    )
    .returning();

  return row ? toTodoDto(row) : null;
}
