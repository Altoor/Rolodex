import { eq } from "drizzle-orm";
import { db, todos } from "@repo/db";
import { todoEmbeddingText, tryEmbedText } from "@repo/ai";
import type { ToolRunContext } from "../../../model";
import { findTodoMatches, type TodoCandidate } from "./search";

export async function resolveTodoId(
  context: ToolRunContext,
  options: { includeArchived?: boolean } = {},
): Promise<TodoCandidate> {
  const { todo } = await findTodoMatches(context, options);
  return todo;
}

export async function saveTodoWithEmbedding(todo: {
  id: number;
  name: string;
  description: string;
}): Promise<void> {
  const embedding = await tryEmbedText(todoEmbeddingText(todo));
  if (!embedding) return;

  await db
    .update(todos)
    .set({ descriptionEmbedding: embedding })
    .where(eq(todos.id, todo.id));
}

export function toToolTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id,
    name: todo.name,
    description: todo.description,
    done: todo.done,
    doByDate: todo.doByDate?.toISOString() ?? null,
    createdAt: todo.createdAt?.toISOString() ?? null,
    archivedAt: todo.archivedAt?.toISOString() ?? null,
    authorId: todo.authorId,
    actorId: todo.actorId,
  };
}
