import { builder } from "../../builder";

export const QueuedTaskStatus = builder.enumType("QueuedTaskStatus", {
  values: ["queued", "running", "awaiting_input", "completed", "failed"],
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
    pendingChoice: t.field({
      type: "JSON",
      nullable: true,
      resolve: (parent) => parent.pendingChoice ?? null,
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
