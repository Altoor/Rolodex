export interface TodoItemData {
  id: number | null;
  name: string;
  description: string;
  done: boolean;
  doByDate: string | null;
  score?: number | null;
}

export interface TodoInput {
  id?: number | null;
  name?: string | null;
  description?: string | null;
  done?: boolean | null;
  doByDate?: unknown;
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
    ...(typeof todo.score === "number" ? { score: todo.score } : {}),
  };
}
