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
  onArchive?: (todo: TodoItemData, archived: boolean) => void;
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
  onArchive,
  onDelete,
  showEmpty = true,
  emptyTitle = "No todos yet",
  emptyDescription = "Create a todo to get started.",
  className,
}: TodoListProps) {
  const active = todos.filter(
    (todo) => !todo.done && todo.archivedAt == null,
  );
  const completed = todos.filter(
    (todo) => todo.done && todo.archivedAt == null,
  );
  const archived = todos.filter((todo) => todo.archivedAt != null);

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
                onArchive={onArchive}
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
                onArchive={onArchive}
                onDelete={onDelete}
              />
            ))}
          </ItemGroup>
        </section>
      ) : null}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Archived · {archived.length}
          </h2>
          <ItemGroup>
            {archived.map((todo) => (
              <TodoItem
                key={todo.id ?? `${todo.name}-${todo.description}`}
                todo={todo}
                editable={editable}
                pending={todo.id != null && pendingIds?.has(todo.id)}
                onToggle={onToggle}
                onSave={onSave}
                onArchive={onArchive}
                onDelete={onDelete}
              />
            ))}
          </ItemGroup>
        </section>
      ) : null}
    </div>
  );
}
