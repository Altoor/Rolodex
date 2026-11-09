"use client";

import { useQuery } from "@apollo/client/react";
import { GET_TODOS } from "@repo/queries/todos/todo-queries";
import { useMemo, useState } from "react";
import { AuthGate } from "../components/auth/auth-gate";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import { TodoForm } from "#components/todo/todo-form";
import { TodoList } from "#components/todo/todo-list";
import { toTodoItem, type TodoItemData } from "../components/todo/types";
import { useTodoActions } from "../components/todo/use-todo-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";

export default function TodosPage() {
  return (
    <AuthGate>
      <TodosPageContent />
    </AuthGate>
  );
}

function TodosPageContent() {
  const { data, error: queryError, loading } = useQuery(GET_TODOS);
  const [createFormKey, setCreateFormKey] = useState(0);

  const todos = useMemo<TodoItemData[]>(() => {
    return (data?.getTodos ?? []).flatMap((todo) => {
      const item = toTodoItem({
        id: todo.id,
        name: todo.name,
        description: todo.description,
        done: todo.done,
        doByDate: todo.doByDate,
      });
      return item ? [item] : [];
    });
  }, [data]);

  const {
    createTodo,
    markDone,
    updateTodo,
    deleteTodo,
    pendingIds,
    error: actionError,
  } = useTodoActions();

  return (
    <PageContainer>
      <PageHeader
        title="Todos"
        description="Create, schedule, and complete your todos."
      />

      <Card>
        <CardHeader>
          <CardTitle>New todo</CardTitle>
          <CardDescription>
            Add a do-by time to sort it into the list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TodoForm
            key={createFormKey}
            onSubmit={async (draft) => {
              const created = await createTodo(draft);
              if (created) setCreateFormKey((current) => current + 1);
            }}
          />
        </CardContent>
      </Card>

      {actionError ? (
        <ErrorState title="Todo operation failed" error={actionError} />
      ) : null}

      {loading ? (
        <LoadingState label="Loading todos…" />
      ) : queryError ? (
        <ErrorState title="Could not load todos" error={queryError} />
      ) : (
        <TodoList
          todos={todos}
          editable
          pendingIds={pendingIds}
          onToggle={(todo, done) => {
            void markDone(todo, done);
          }}
          onSave={(todo, draft) => updateTodo(todo, draft)}
          onDelete={(todo) => {
            void deleteTodo(todo);
          }}
          emptyTitle="No todos yet"
          emptyDescription="Create your first todo above."
        />
      )}
    </PageContainer>
  );
}
