import { builder } from "../builder";

export const UserSettings = builder.drizzleObject("userSettings", {
  name: "UserSettings",
  fields: (t) => ({
    userId: t.exposeInt("userId"),
    defaultTaskId: t.exposeInt("defaultTaskId", { nullable: true }),
    defaultModelName: t.exposeString("defaultModelName", { nullable: true }),
    defaultDecisionModelName: t.exposeString("defaultDecisionModelName", {
      nullable: true,
    }),
    defaultVisionModelName: t.exposeString("defaultVisionModelName", {
      nullable: true,
    }),
    defaultTask: t.relation("defaultTask", { nullable: true }),
    defaultModel: t.relation("defaultModel", { nullable: true }),
    defaultDecisionModel: t.relation("defaultDecisionModel", {
      nullable: true,
    }),
    defaultVisionModel: t.relation("defaultVisionModel", {
      nullable: true,
    }),
    updatedAt: t.field({
      type: "DateTime",
      resolve: (parent) => parent.updatedAt,
    }),
  }),
});
