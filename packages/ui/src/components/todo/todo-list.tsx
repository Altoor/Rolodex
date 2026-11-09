import { EmptyState } from "#components/feedback/empty-state";
import { ItemGroup } from "#components/ui/item";
import { cn } from "cn";
import { TodoItem } from "./todo-item";
import type { TodoDraft, TodoItemData } from "./types";

interface TodoListProps {
  todos: TodoItemData[];
  editable?: boolean;
  pendingIds?: ReadonlySet<number>;
  onToggle?: (todo: TodoItemData, done: boolean) => void;
  onSave?: (
    todo: TodoItemData,
    draft: TodoDraft,
  ) => Promise<TodoItemData | null> | TodoItemData | null | void;
  onDelete?: (todo: TodoItemData) => void;
  showEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function TodoList({
  todos,
  editable = false,
  pendingIds,
  onToggle,
  onSave,
  onDelete,
  showEmpty = true,
  emptyTitle = "No todos yet",
  emptyDescription = "Create a todo to get started.",
  className,
}: TodoListProps) {
  const active = todos.filter((todo) => !todo.done);
  const completed = todos.filter((todo) => todo.done);

  if (todos.length === 0) {
    return showEmpty ? (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    ) : null;
  }

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {active.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Active · {active.length}</h2>
          <ItemGroup>
            {active.map((todo) => (
              <TodoItem
                key={todo.id ?? `${todo.name}-${todo.description}`}
                todo={todo}
                editable={editable}
                pending={todo.id != null && pendingIds?.has(todo.id)}
                onToggle={onToggle}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))}
          </ItemGroup>
        </section>
      ) : null}

      {completed.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Completed · {completed.length}
          </h2>
          <ItemGroup>
            {completed.map((todo) => (
              <TodoItem
                key={todo.id ?? `${todo.name}-${todo.description}`}
                todo={todo}
                editable={editable}
                pending={todo.id != null && pendingIds?.has(todo.id)}
                onToggle={onToggle}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))}
          </ItemGroup>
        </section>
      ) : null}
    </div>
  );
}
