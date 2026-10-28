import { builder } from "../builder";

export const TaskType = builder.enumType("TaskType", {
  values: ["decision", "textPrompt", "tool"],
});

export const Task = builder.drizzleObject("tasks", {
  name: "Task",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    type: t.exposeString("type"),
    decisionId: t.exposeInt("decisionId"),
    taskResults: t.relation("taskResults"),
  }),
});

export const TaskResult = builder.drizzleObject("taskResults", {
  name: "TaskResult",
  fields: (t) => ({
    id: t.exposeInt("id"),
    taskId: t.exposeInt("taskId"),
    type: t.exposeString("type"),
    option: t.exposeString("option"),
    scoreThreshold: t.exposeFloat("scoreThreshold"),
    probabilityThreshold: t.exposeFloat("probabilityThreshold"),
    confidenceThreshold: t.exposeFloat("confidenceThreshold"),
    resultTaskId: t.exposeInt("resultTaskId"),
    resultTask: t.relation("task"),
  }),
});

export const QueuedTask = builder.drizzleObject("queuedTasks", {
  name: "QueuedTask",
  fields: (t) => ({
    id: t.exposeInt("id"),
    taskId: t.exposeInt("taskId"),
    state: t.exposeString("state"),
    completed: t.exposeBoolean("completed"),
    queued_at: t.field({
      type: "DateTime",
      resolve: (parent) =>
        parent.queued_at ? new Date(parent.queued_at) : new Date(),
      nullable: true,
    }),
    queued_by: t.exposeInt("queued_by"),
  }),
});
