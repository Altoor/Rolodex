import { builder } from "../../builder";
import { Tool } from "../../tool";
import { getToolDefinition } from "@repo/tools";

export const TaskType = builder.enumType("TaskType", {
  values: ["decision", "textPrompt", "tool", "userDecision"],
});

export const UserDecisionType = builder.enumType("UserDecisionType", {
  values: ["yesNo", "list", "dropdown"],
});

export const UserDecisionOptionKind = builder.enumType(
  "UserDecisionOptionKind",
  {
    values: ["static", "dynamic"],
  },
);

export const UserDecisionOption = builder.drizzleObject("userDecisionOptions", {
  name: "UserDecisionOption",
  fields: (t) => ({
    id: t.exposeInt("id"),
    taskId: t.exposeInt("taskId"),
    kind: t.field({
      type: UserDecisionOptionKind,
      resolve: (parent) => parent.kind,
    }),
    label: t.exposeString("label", { nullable: true }),
    description: t.exposeString("description", { nullable: true }),
    value: t.exposeString("value", { nullable: true }),
    selector: t.field({
      type: "JSON",
      nullable: true,
      resolve: (parent) => parent.selector ?? null,
    }),
    labelPath: t.exposeString("labelPath", { nullable: true }),
    descriptionPath: t.exposeString("descriptionPath", { nullable: true }),
    valuePath: t.exposeString("valuePath", { nullable: true }),
    resultTaskId: t.exposeInt("resultTaskId", { nullable: true }),
    appendState: t.exposeBoolean("appendState"),
    sortOrder: t.exposeInt("sortOrder"),
    resultTask: t.relation("resultTask"),
  }),
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
    forceUserDecideIfNoMatch: t.exposeBoolean("forceUserDecideIfNoMatch"),
    userDecisionType: t.field({
      type: UserDecisionType,
      resolve: (parent) => parent.userDecisionType,
    }),
    userDecisionConfig: t.field({
      type: "JSON",
      nullable: true,
      resolve: (parent) => parent.userDecisionConfig ?? null,
    }),
    tool: t.field({
      type: Tool,
      nullable: true,
      resolve: (parent) =>
        parent.toolKey ? getToolDefinition(parent.toolKey) : null,
    }),
    decision: t.relation("decision"),
    taskResults: t.relation("taskResults"),
    userDecisionOptions: t.relation("userDecisionOptions"),
    fallbackTask: t.relation("fallbackTask"),
  }),
});
