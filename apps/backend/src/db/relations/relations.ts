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

  decisions: {
    author: r.one.users({
      from: r.decisions.authorId,
      to: r.users.id,
    }),
  },

  queue: {
    queued_by: r.one.users({
      from: r.queuedTasks.queued_by,
      to: r.users.id,
    }),

    queuedTask: r.one.tasks({
      from: r.queuedTasks.taskId,
      to: r.tasks.id,
    }),
  },

  tasks: {
    taskResults: r.many.taskResults(),
    decision: r.one.decisions({
      from: r.tasks.decisionId,
      to: r.decisions.id,
    }),
  },

  taskResults: {
    task: r.one.tasks({
      from: r.taskResults.taskId,
      to: r.tasks.id,
    }),

    resultTask: r.one.tasks({
      from: r.taskResults.resultTaskId,
      to: r.tasks.id,
      alias: "resultTask",
    }),
  },

  todos_todo: {
    actor: r.one.users({
      from: r.todos.actorId,
      to: r.users.id,
    }),
  },
}));
