// relations.ts
import * as schema from "../schema";
import { defineRelations } from "drizzle-orm";

export const relations = defineRelations(schema, (r) => ({
  users: {
    todos: r.many.todos(),
    todos_todo: r.many.todos(),
  },

  todos: {
    author: r.one.users({
      from: r.todos.authorId,
      to: r.users.id,
    }),
  },

  todos_todo: {
    actor: r.one.users({
      from: r.todos.actorId,
      to: r.users.id,
    }),
  },
}));
