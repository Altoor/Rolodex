import { describe, expect, it } from "vitest";
import {
  canManageTodo,
  canMarkTodoDone,
  canViewTodo,
  isTodoAuthor,
} from "./permissions";

const todo = { authorId: 1, actorId: 2 };

describe("todo permissions", () => {
  it("lets the author manage the todo", () => {
    expect(isTodoAuthor(todo, 1)).toBe(true);
    expect(canManageTodo(todo, 1)).toBe(true);
    expect(canViewTodo(todo, 1)).toBe(true);
    expect(canMarkTodoDone(todo, 1)).toBe(true);
  });

  it("lets the actor see and toggle done, but not manage", () => {
    expect(isTodoAuthor(todo, 2)).toBe(false);
    expect(canManageTodo(todo, 2)).toBe(false);
    expect(canViewTodo(todo, 2)).toBe(true);
    expect(canMarkTodoDone(todo, 2)).toBe(true);
  });

  it("hides the todo from everyone else", () => {
    expect(canViewTodo(todo, 3)).toBe(false);
    expect(canMarkTodoDone(todo, 3)).toBe(false);
    expect(canManageTodo(todo, 3)).toBe(false);
  });

  it("treats the author as the actor when no one else is assigned", () => {
    const selfAssigned = { authorId: 1, actorId: 1 };
    expect(canManageTodo(selfAssigned, 1)).toBe(true);
    expect(canMarkTodoDone(selfAssigned, 1)).toBe(true);
  });
});
