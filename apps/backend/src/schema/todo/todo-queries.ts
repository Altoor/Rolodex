import { GraphQLError } from "graphql";
import { builder, db } from "../builder";
import { Todo } from "./todo";
import { requireUserId } from "../auth";

builder.queryType({
  fields: (t) => ({
    getTodos: t.drizzleField({
      type: [Todo],
      args: {
        includeArchived: t.arg.boolean({ required: false }),
      },
      resolve: (_query, _root, { includeArchived }, ctx) => {
        const userId = requireUserId(ctx);

        return db.query.todos.findMany({
          where: {
            OR: [{ actorId: userId }, { authorId: userId }],
            ...(includeArchived ? {} : { archivedAt: { isNull: true } }),
          },
          orderBy: (todos, { asc }) => [
            asc(todos.done),
            asc(todos.doByDate),
            asc(todos.id),
          ],
        });
      },
    }),

    getTodo: t.drizzleField({
      type: Todo,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_query, _root, { id }, ctx) => {
        const userId = requireUserId(ctx);
        const todo = await db.query.todos.findFirst({
          where: {
            AND: [
              {
                OR: [{ actorId: userId }, { authorId: userId }],
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
