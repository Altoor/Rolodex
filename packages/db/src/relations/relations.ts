// relations.ts
import * as schema from "../schema";
import { defineRelations } from "drizzle-orm";

export const relations = defineRelations(schema, (r) => ({
  users: {
    todos: r.many.todos(),
    todos_todo: r.many.todos(),
    settings: r.one.userSettings({
      from: r.users.id,
      to: r.userSettings.userId,
    }),
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

  queuedTasks: {
    user: r.one.users({
      from: r.queuedTasks.queued_by,
      to: r.users.id,
    }),

    task: r.one.tasks({
      from: r.queuedTasks.taskId,
      to: r.tasks.id,
    }),
  },

  tasks: {
    taskResults: r.many.taskResults(),
    userDecisionOptions: r.many.userDecisionOptions(),
    decision: r.one.decisions({
      from: r.tasks.decisionId,
      to: r.decisions.id,
    }),
    fallbackTask: r.one.tasks({
      from: r.tasks.fallbackTaskId,
      to: r.tasks.id,
      alias: "fallbackTask",
    }),
  },

  userDecisionOptions: {
    task: r.one.tasks({
      from: r.userDecisionOptions.taskId,
      to: r.tasks.id,
    }),

    resultTask: r.one.tasks({
      from: r.userDecisionOptions.resultTaskId,
      to: r.tasks.id,
      alias: "resultTask",
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

  userSettings: {
    user: r.one.users({
      from: r.userSettings.userId,
      to: r.users.id,
    }),
    defaultTask: r.one.tasks({
      from: r.userSettings.defaultTaskId,
      to: r.tasks.id,
    }),
    defaultModel: r.one.models({
      from: r.userSettings.defaultModelName,
      to: r.models.name,
    }),
    defaultDecisionModel: r.one.models({
      from: r.userSettings.defaultDecisionModelName,
      to: r.models.name,
    }),
  },
}));
