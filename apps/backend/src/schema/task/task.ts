import { builder } from "../builder";
import { Tool } from "../tool";
import { getToolDefinition } from "../../tools/registry";

export const TaskType = builder.enumType("TaskType", {
  values: ["decision", "textPrompt", "tool"],
});

export const ToolOutputType = builder.enumType("ToolOutputType", {
  values: ["normal", "foreach"],
});

export const Task = builder.drizzleObject("tasks", {
  name: "Task",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    type: t.exposeString("type"),
    fallbackTaskId: t.exposeInt("fallbackTaskId"),
    toolKey: t.exposeString("toolKey", { nullable: true }),
    toolConfig: t.field({
      type: "JSON",
      nullable: true,
      resolve: (parent) => parent.toolConfig ?? null,
    }),
    toolOutputType: t.field({
      type: ToolOutputType,
      resolve: (parent) => parent.toolOutputType,
    }),
    onTrueTaskId: t.exposeInt("onTrueTaskId", { nullable: true }),
    onFalseTaskId: t.exposeInt("onFalseTaskId", { nullable: true }),
    model: t.exposeString("model", { nullable: true }),
    decisionModel: t.exposeString("decisionModel", { nullable: true }),
    tool: t.field({
      type: Tool,
      nullable: true,
      resolve: (parent) =>
        parent.toolKey ? getToolDefinition(parent.toolKey) : null,
    }),
    decision: t.relation("decision"),
    taskResults: t.relation("taskResults"),
    fallbackTask: t.relation("fallbackTask"),
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
    appendState: t.exposeBoolean("appendState"),
    resultTask: t.relation("task"),
  }),
});

export const QueuedTaskStatus = builder.enumType("QueuedTaskStatus", {
  values: ["queued", "running", "completed", "failed"],
});

export const QueuedTask = builder.drizzleObject("queuedTasks", {
  name: "QueuedTask",
  fields: (t) => ({
    id: t.exposeInt("id"),
    taskId: t.exposeInt("taskId"),
    state: t.exposeString("state"),
    toolState: t.field({
      type: "JSON",
      resolve: (parent) => parent.toolState ?? [],
    }),
    parentQueuedTaskId: t.exposeInt("parentQueuedTaskId", { nullable: true }),
    depth: t.exposeInt("depth"),
    status: t.field({
      type: QueuedTaskStatus,
      resolve: (parent) => parent.status,
    }),
    runId: t.exposeString("runId"),
    result: t.field({
      type: "JSON",
      nullable: true,
      resolve: (parent) => parent.result ?? null,
    }),
    queued_at: t.field({
      type: "DateTime",
      resolve: (parent) =>
        parent.queued_at ? new Date(parent.queued_at) : new Date(),
      nullable: true,
    }),
    queued_by: t.exposeInt("queued_by"),
    model: t.exposeString("model", { nullable: true }),
    decisionModel: t.exposeString("decisionModel", { nullable: true }),
    task: t.relation("task"),
  }),
});

export interface QueuedTaskEventPayload {
  queuedTask: any;
  message: string;
}

export const QueuedTaskEvent = builder
  .objectRef<QueuedTaskEventPayload>("QueuedTaskEvent")
  .implement({
    fields: (t) => ({
      queuedTask: t.field({
        type: QueuedTask,
        resolve: (parent) => parent.queuedTask,
      }),
      message: t.string({ resolve: (parent) => parent.message }),
    }),
  });
