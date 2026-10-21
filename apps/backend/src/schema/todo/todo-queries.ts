import { GraphQLError } from "graphql";
import { builder, db } from "../builder";
import { Todo } from "./todo";

builder.queryType({
  fields: (t) => ({
    getTodos: t.drizzleField({
      type: [Todo],
      resolve: (_query, _root, { id }, ctx) =>
        db.query.todos.findMany({
          where: {
            OR: [
              { actorId: (ctx as any).user.id },
              { authorId: (ctx as any).user.id },
            ],
          },
        }),
    }),

    getTodo: t.drizzleField({
      type: Todo,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_query, _root, { id }, ctx) => {
        const todo = await db.query.todos.findFirst({
          where: {
            AND: [
              {
                OR: [
                  { actorId: (ctx as any).user.id },
                  { authorId: (ctx as any).user.id },
                ],
              },

              { id: id },
            ],
          },
        });
        if (!todo) {
          throw new GraphQLError("no todo found");
        }
        return todo;
      },
    }),
  }),
});
