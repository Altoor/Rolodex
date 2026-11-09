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
    authorId: t.exposeInt("authorId"),
    actorId: t.exposeInt("actorId"),
  }),
});
