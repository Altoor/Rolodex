import { builder } from "../builder";

export const Todo = builder.drizzleObject("todos", {
  name: "Todo",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    done: t.exposeBoolean("done"),
    description: t.exposeString("description"),
    doByDate: t.field({
      type: "DateTime",
      nullable: true,
      resolve: (parent) => (parent.doByDate ? new Date(parent.doByDate) : null),
    }),
    createdAt: t.field({
      type: "DateTime",
      resolve: (parent) =>
        parent.createdAt ? new Date(parent.createdAt) : new Date(),
    }),
    archivedAt: t.field({
      type: "DateTime",
      nullable: true,
      resolve: (parent) =>
        parent.archivedAt ? new Date(parent.archivedAt) : null,
    }),
    archived: t.field({
      type: "Boolean",
      resolve: (parent) => parent.archivedAt != null,
    }),
    authorId: t.exposeInt("authorId"),
    actorId: t.exposeInt("actorId"),
  }),
});
