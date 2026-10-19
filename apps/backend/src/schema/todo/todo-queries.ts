import { builder, db } from "../builder";
import { Todo } from "./todo";

builder.queryType({
  fields: (t) => ({
    getTodos: t.drizzleField({
      type: [Todo],
      resolve: () => db.query.todos.findMany(),
    }),
  }),
});
