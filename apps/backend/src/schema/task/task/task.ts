import { builder } from "../../builder";
import { Tool } from "../../tool";
import { getToolDefinition } from "@repo/tools";

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
