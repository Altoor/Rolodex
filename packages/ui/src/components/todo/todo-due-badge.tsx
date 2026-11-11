import { Badge } from "#components/ui/badge";
import { formatTodoDate, todoDateStatus } from "#lib/todo-date";
import type { TodoItemData } from "./types";

interface TodoDueBadgeProps {
  todo: TodoItemData;
}

export function TodoDueBadge({ todo }: TodoDueBadgeProps) {
  const status = todoDateStatus(todo);
  const label = formatTodoDate(todo.doByDate);

  if (status === "overdue") {
    return <Badge variant="destructive">Overdue · {label}</Badge>;
  }

  if (status === "soon") {
    return <Badge variant="secondary">Due soon · {label}</Badge>;
  }

  if (status === "upcoming") {
    return <Badge variant="outline">{label}</Badge>;
  }

  return <Badge variant="ghost">No due date</Badge>;
}
