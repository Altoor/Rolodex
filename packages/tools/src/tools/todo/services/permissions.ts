/**
 * Todo authorization rules.
 *
 * A todo has an author (the creator/owner) and an actor (the assignee). The
 * actor exists so a todo can be delegated: the actor can see the todo and mark
 * it done or not done, but only the author may change its details, reassign the
 * actor, archive it, or delete it.
 */
export interface TodoOwnership {
  authorId: number;
  actorId: number;
}

/** True when the user created the todo and owns it. */
export function isTodoAuthor(todo: TodoOwnership, userId: number): boolean {
  return todo.authorId === userId;
}

/** Authors and actors may see the todo. */
export function canViewTodo(todo: TodoOwnership, userId: number): boolean {
  return isTodoAuthor(todo, userId) || todo.actorId === userId;
}

/** Authors and actors may toggle done; this is the actor's only write. */
export function canMarkTodoDone(todo: TodoOwnership, userId: number): boolean {
  return canViewTodo(todo, userId);
}

/**
 * Only the author may edit details, reassign the actor, archive, or delete.
 * Unlike {@link canMarkTodoDone}, this excludes the actor.
 */
export function canManageTodo(todo: TodoOwnership, userId: number): boolean {
  return isTodoAuthor(todo, userId);
}
