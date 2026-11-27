"use client";

import { ConfirmButton } from "#components/feedback/confirm-button";
import { Button } from "#components/ui/button";
import { Checkbox } from "#components/ui/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "#components/ui/item";
import { Archive, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { TodoDueBadge } from "./todo-due-badge";
import { TodoForm } from "./todo-form";
import type { TodoDraft, TodoItemData } from "./types";

interface TodoItemProps {
  todo: TodoItemData;
  editable?: boolean;
  /** Current user id; only the author gets edit/archive/delete controls. */
  viewerId?: number | null;
  pending?: boolean;
  onToggle?: (todo: TodoItemData, done: boolean) => void;
  onSave?: (
    todo: TodoItemData,
    draft: TodoDraft,
  ) => Promise<TodoItemData | null> | TodoItemData | null | void;
  onArchive?: (todo: TodoItemData, archived: boolean) => void;
  onDelete?: (todo: TodoItemData) => void;
}

export function TodoItem({
  todo,
  editable = false,
  viewerId,
  pending = false,
  onToggle,
  onSave,
  onArchive,
  onDelete,
}: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const canToggle = editable && todo.id != null && !pending;
  // Actors may mark done, but only the author may edit, archive, or delete.
  const canManage =
    canToggle && viewerId != null && todo.authorId === viewerId;
  const archived = todo.archivedAt != null;

  if (editing && onSave) {
    return (
      <Item variant="outline">
        <ItemContent>
          <TodoForm
            initialTodo={todo}
            onSubmit={async (draft) => {
              const result = await onSave(todo, draft);
              if (result !== null) setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </ItemContent>
      </Item>
    );
  }

  return (
    <Item variant={todo.done ? "muted" : "outline"}>
      <ItemMedia>
        <Checkbox
          checked={todo.done}
          disabled={!canToggle}
          onCheckedChange={(checked) => onToggle?.(todo, checked)}
          className="size-6"
          aria-label={
            todo.done
              ? `Mark ${todo.name} as not done`
              : `Mark ${todo.name} as done`
          }
        />
      </ItemMedia>

      <ItemContent>
        <ItemTitle
          className={todo.done ? "text-muted-foreground line-through" : ""}
        >
          {todo.name}
        </ItemTitle>
        {todo.description ? (
          <ItemDescription>{todo.description}</ItemDescription>
        ) : null}
        <div className="pt-1">
          <TodoDueBadge todo={todo} />
        </div>
      </ItemContent>

      {editable && canManage ? (
        <ItemActions>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={`Edit ${todo.name}`}
            aria-label={`Edit ${todo.name}`}
            disabled={!canManage}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          {onArchive ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={
                archived ? `Restore ${todo.name}` : `Archive ${todo.name}`
              }
              aria-label={
                archived ? `Restore ${todo.name}` : `Archive ${todo.name}`
              }
              disabled={!canManage}
              onClick={() => onArchive(todo, !archived)}
            >
              {archived ? <RotateCcw /> : <Archive />}
            </Button>
          ) : null}
          {onDelete ? (
            <ConfirmButton
              title={`Delete ${todo.name}`}
              onConfirm={() => onDelete(todo)}
              disabled={!canManage}
            >
              <Trash2 />
            </ConfirmButton>
          ) : null}
        </ItemActions>
      ) : null}
    </Item>
  );
}
