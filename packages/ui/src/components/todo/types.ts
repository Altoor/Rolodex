export interface TodoItemData {
  id: number | null;
  name: string;
  description: string;
  done: boolean;
  doByDate: string | null;
  createdAt?: string | null;
  archivedAt?: string | null;
  score?: number | null;
}

export interface TodoInput {
  id?: number | null;
  name?: string | null;
  description?: string | null;
  done?: boolean | null;
  doByDate?: unknown;
  createdAt?: unknown;
  archivedAt?: unknown;
  score?: number | null;
}

export interface TodoDraft {
  name: string;
  description: string;
  doByDate: string | null;
}

/**
 * Normalizes a GraphQL row, a tool output entry, or a mutation result into the
 * shape the todo components expect.
 */
export function toTodoItem(todo: TodoInput): TodoItemData | null {
  const name = todo.name?.trim();
  if (!name) return null;

  return {
    id: todo.id ?? null,
    name,
    description: todo.description ?? "",
    done: Boolean(todo.done),
    doByDate: typeof todo.doByDate === "string" ? todo.doByDate : null,
    createdAt:
      typeof todo.createdAt === "string" ? todo.createdAt : null,
    archivedAt:
      typeof todo.archivedAt === "string" ? todo.archivedAt : null,
    ...(typeof todo.score === "number" ? { score: todo.score } : {}),
  };
}
