import { builder } from "../builder";

export const UserSettings = builder.drizzleObject("userSettings", {
  name: "UserSettings",
  fields: (t) => ({
    userId: t.exposeInt("userId"),
    defaultTaskId: t.exposeInt("defaultTaskId", { nullable: true }),
    defaultModelName: t.exposeString("defaultModelName", { nullable: true }),
    defaultTask: t.relation("defaultTask", { nullable: true }),
    defaultModel: t.relation("defaultModel", { nullable: true }),
    updatedAt: t.field({
      type: "DateTime",
      resolve: (parent) => parent.updatedAt,
    }),
  }),
});
