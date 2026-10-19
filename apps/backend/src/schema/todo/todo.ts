import { builder } from "../builder";

export const Todo = builder.drizzleObject("todos", {
  name: "Todo",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    done: t.exposeBoolean("done"),
    content: t.exposeString("content"),
    authorId: t.exposeInt("authorId"),
    actorId: t.exposeInt("actorId"),
  }),
});
