const pad = (value: number) => String(value).padStart(2, "0");

// ISO -> value for <input type="datetime-local">
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// <input type="datetime-local"> -> ISO for GraphQL / tool input
export function fromDateTimeLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function formatTodoDate(value: string | null | undefined): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export type TodoDateStatus = "none" | "overdue" | "soon" | "upcoming";

export function todoDateStatus(todo: {
  doByDate: string | null;
  done: boolean;
}): TodoDateStatus {
  if (!todo.doByDate) return "none";

  const due = new Date(todo.doByDate).getTime();
  if (Number.isNaN(due)) return "none";

  const now = Date.now();
  if (!todo.done && due < now) return "overdue";

  const oneDay = 24 * 60 * 60 * 1000;
  if (!todo.done && due - now <= oneDay) return "soon";

  return "upcoming";
}
