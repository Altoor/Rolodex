import { eq } from "drizzle-orm";
import { todos } from "../../db";
import { builder, db } from "../builder";
import { Todo } from "./todo";
import { GraphQLError } from "graphql/error";
import { GraphQLString } from "graphql";

builder.mutationType({
  fields: (t) => ({
    createTodo: t.drizzleField({
      type: Todo,
      args: {
        name: t.arg.string({ required: true }),
        content: t.arg.string({ required: false }),
        actor_id: t.arg.int({ required: false }),
      },
      resolve: async (_query, _root, { name, content, actor_id }, ctx) => {
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        const todo = {
          name,
          content: content ?? "",
          authorId: author_id,
          actorId: actor_id ?? author_id,
          done: false,
        };
        const createdTodo = await db.insert(todos).values(todo).returning();

        return createdTodo[0];
      },
    }),

    markTodoDone: t.drizzleField({
      type: Todo,
      args: {
        id: t.arg.int({ required: true }),
        done: t.arg.boolean({ required: true }),
      },
      resolve: async (_query, _root, { id, done }, ctx) => {
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

        const todoDto = { ...todo, done: done, id: undefined };

        const updatedTodo = await db
          .update(todos)
          .set(todoDto)
          .where(eq(todos.id, id))
          .returning();

        return updatedTodo[0];
      },
    }),

    updateTodo: t.drizzleField({
      type: Todo,
      args: {
        id: t.arg.int({ required: true }),
        name: t.arg.string({ required: false }),
        content: t.arg.string({ required: false }),
        actor_id: t.arg.int({ required: false }),
      },
      resolve: async (_query, _root, { id, name, content, actor_id }, ctx) => {
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

        const todoDto = {
          name: name ?? todo.name,
          content: content ?? todo.content,
          authorId: todo.authorId,
          actorId: actor_id ?? todo.actorId,
          done: false,
        };

        const updatedTodo = await db
          .update(todos)
          .set(todoDto)
          .where(eq(todos.id, id))
          .returning();

        return updatedTodo[0];
      },
    }),

    deleteTodo: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, _ctx) => {
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

        return "successfully deleted todo";
      },
    }),
  }),
});
