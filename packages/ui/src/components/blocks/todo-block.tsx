"use client";

import { TodoList } from "#components/todo/todo-list";
import { toTodoItem, type TodoInput, type TodoItemData } from "../todo/types";
import { useTodoActions } from "../todo/use-todo-actions";
import { useMemo, useState } from "react";
import type { BlockComponentProps, BlockDefinition } from "./types";

const TODO_TOOL_KEYS = new Set([
  "find_todo",
  "find_todos",
  "create_todo",
  "update_todo",
  "mark_todo_done",
  "archive_todo",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectTodos(value: unknown, output: TodoInput[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTodos(item, output);
    return;
  }

  if (isRecord(value)) {
    output.push(value as TodoInput);
  }
}

export function extractBlockTodos(output: unknown): TodoItemData[] {
  if (!isRecord(output)) return [];

  const candidates: TodoInput[] = [];
  // A display_block forced to the todo block can pass a single bare todo.
  if (typeof output.name === "string") {
    candidates.push(output as TodoInput);
  }
  collectTodos(output.todo, candidates);
  collectTodos(output.todos, candidates);
  collectTodos(output.candidates, candidates);

  const seen = new Set<string>();
  const todos: TodoItemData[] = [];

  for (const candidate of candidates) {
    const todo = toTodoItem(candidate);
    if (!todo) continue;

    const key =
      todo.id != null
        ? `id:${todo.id}`
        : `name:${todo.name}|${todo.description}`;
    if (seen.has(key)) continue;

    seen.add(key);
    todos.push(todo);
  }

  return todos;
}

function hasTodoShape(output: unknown): boolean {
  if (!isRecord(output)) return false;

  if (typeof output.name === "string") {
    // A bare todo item from display_block. Require a todo-specific field so
    // unrelated objects that happen to have a name do not match.
    return (
      typeof output.done === "boolean" ||
      "doByDate" in output ||
      typeof output.createdAt === "string" ||
      typeof output.archivedAt === "string"
    );
  }

  if (isRecord(output.todo) && typeof output.todo.name === "string") {
    return true;
  }

  for (const key of ["todos", "candidates"]) {
    const value = output[key];
    if (
      Array.isArray(value) &&
      value.some((item) => isRecord(item) && typeof item.name === "string")
    ) {
      return true;
    }
  }

  return false;
}

export function TodoBlock({ output }: BlockComponentProps) {
  const extracted = useMemo(() => extractBlockTodos(output), [output]);
  const [todos, setTodos] = useState(extracted);

  const { markDone, updateTodo, archiveTodo, deleteTodo, pendingIds, error } =
    useTodoActions({
      onUpdated: (todo) =>
        setTodos((current) =>
          current.map((item) => (item.id === todo.id ? todo : item)),
        ),
      onArchived: (todo) =>
        setTodos((current) =>
          current.map((item) => (item.id === todo.id ? todo : item)),
        ),
      onDeleted: (id) =>
        setTodos((current) => current.filter((item) => item.id !== id)),
    });

  if (todos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <TodoList
        todos={todos}
        editable
        showEmpty={false}
        pendingIds={pendingIds}
        onToggle={(todo, done) => {
          void markDone(todo, done);
        }}
        onSave={(todo, draft) => updateTodo(todo, draft)}
        onArchive={(todo, archived) => {
          void archiveTodo(todo, archived);
        }}
        onDelete={(todo) => {
          void deleteTodo(todo);
        }}
      />
    </div>
  );
}

export const todoBlock: BlockDefinition = {
  id: "todo",
  match: ({ output, toolKey }) =>
    (toolKey != null && TODO_TOOL_KEYS.has(toolKey)) || hasTodoShape(output),
  Component: TodoBlock,
};
