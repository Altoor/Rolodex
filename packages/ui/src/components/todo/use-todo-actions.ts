"use client";

import { useMutation } from "@apollo/client/react";
import {
  CREATE_TODO,
  DELETE_TODO,
  MARK_TODO_DONE,
  UPDATE_TODO,
} from "@repo/queries/todos/todo-mutations";
import { GET_TODOS } from "@repo/queries/todos/todo-queries";
import { useState } from "react";
import { toTodoItem, type TodoDraft, type TodoItemData } from "./types";

interface UseTodoActionsOptions {
  onUpdated?: (todo: TodoItemData) => void;
  onDeleted?: (id: number) => void;
}

const refetchOptions = {
  refetchQueries: [GET_TODOS],
  awaitRefetchQueries: true,
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Todo operation failed";
}

export function useTodoActions({
  onUpdated,
  onDeleted,
}: UseTodoActionsOptions = {}) {
  const [createMutation] = useMutation(CREATE_TODO, refetchOptions);
  const [markMutation] = useMutation(MARK_TODO_DONE, refetchOptions);
  const [updateMutation] = useMutation(UPDATE_TODO, refetchOptions);
  const [deleteMutation] = useMutation(DELETE_TODO, refetchOptions);

  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async <T>(
    id: number,
    action: () => Promise<T>,
  ): Promise<T | null> => {
    setPendingIds((current) => new Set(current).add(id));
    setError(null);

    try {
      return await action();
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const createTodo = async (draft: TodoDraft): Promise<TodoItemData | null> => {
    setCreating(true);
    setError(null);

    try {
      const { data, error: mutationError } = await createMutation({
        variables: draft,
      });
      if (mutationError) throw mutationError;

      return data?.createTodo ? toTodoItem(data.createTodo) : null;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setCreating(false);
    }
  };

  const markDone = async (
    todo: TodoItemData,
    done: boolean,
  ): Promise<TodoItemData | null> => {
    const id = todo.id;
    if (id == null) return null;

    return run(id, async () => {
      const { data, error: mutationError } = await markMutation({
        variables: { id, done },
      });
      if (mutationError) throw mutationError;

      const updated = data?.markTodoDone ? toTodoItem(data.markTodoDone) : null;
      if (updated) onUpdated?.(updated);
      return updated;
    });
  };

  const updateTodo = async (
    todo: TodoItemData,
    draft: TodoDraft,
  ): Promise<TodoItemData | null> => {
    const id = todo.id;
    if (id == null) return null;

    return run(id, async () => {
      const { data, error: mutationError } = await updateMutation({
        variables: { id, ...draft },
      });
      if (mutationError) throw mutationError;

      const updated = data?.updateTodo ? toTodoItem(data.updateTodo) : null;
      if (updated) onUpdated?.(updated);
      return updated;
    });
  };

  const deleteTodo = async (todo: TodoItemData): Promise<void> => {
    const id = todo.id;
    if (id == null) return;

    await run(id, async () => {
      const { error: mutationError } = await deleteMutation({
        variables: { id },
      });
      if (mutationError) throw mutationError;

      onDeleted?.(id);
      return true;
    });
  };

  return {
    createTodo,
    markDone,
    updateTodo,
    deleteTodo,
    pendingIds,
    creating,
    error,
  };
}
