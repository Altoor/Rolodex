import { eq } from "drizzle-orm";
import { todos } from "@repo/db";
import { builder, db } from "../builder";
import { Todo } from "./todo";
import { GraphQLError } from "graphql/error";
import { requireUserId } from "../auth";
import { saveTodoWithEmbedding } from "@repo/tools/tools/todo/services/todo";

builder.mutationType({
  fields: (t) => ({
    createTodo: t.drizzleField({
      type: Todo,
      args: {
        name: t.arg.string({ required: true }),
        description: t.arg.string({ required: false }),
        doByDate: t.arg({ type: "DateTime", required: false }),
        actor_id: t.arg.int({ required: false }),
      },
      resolve: async (
        _query,
        _root,
        { name, description, doByDate, actor_id },
        ctx,
      ) => {
        const author_id = requireUserId(ctx);

        const todo = {
          name,
          description: description ?? "",
          doByDate: doByDate ?? null,
          authorId: author_id,
          actorId: actor_id ?? author_id,
          done: false,
        };
        const [createdTodo] = await db.insert(todos).values(todo).returning();

        if (!createdTodo) {
          throw new GraphQLError("could not create todo");
        }

        await saveTodoWithEmbedding(createdTodo);

        return createdTodo;
      },
    }),

    markTodoDone: t.drizzleField({
      type: Todo,
      args: {
        id: t.arg.int({ required: true }),
        done: t.arg.boolean({ required: true }),
      },
      resolve: async (_query, _root, { id, done }, ctx) => {
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
        description: t.arg.string({ required: false }),
        doByDate: t.arg({ type: "DateTime", required: false }),
        actor_id: t.arg.int({ required: false }),
      },
      resolve: async (
        _query,
        _root,
        { id, name, description, doByDate, actor_id },
        ctx,
      ) => {
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

        const todoDto = {
          name: name ?? todo.name,
          description: description ?? todo.description,
          authorId: todo.authorId,
          actorId: actor_id ?? todo.actorId,
          done: todo.done,
          ...(doByDate !== undefined ? { doByDate } : {}),
        };

        const [updatedTodo] = await db
          .update(todos)
          .set(todoDto)
          .where(eq(todos.id, id))
          .returning();

        if (!updatedTodo) {
          throw new GraphQLError("could not update todo");
        }

        if (name !== undefined || description !== undefined) {
          await saveTodoWithEmbedding(updatedTodo);
        }

        return updatedTodo;
      },
    }),

    archiveTodo: t.drizzleField({
      type: Todo,
      args: {
        id: t.arg.int({ required: true }),
        archived: t.arg.boolean({ required: false }),
      },
      resolve: async (_query, _root, { id, archived }, ctx) => {
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

        const [updatedTodo] = await db
          .update(todos)
          .set({ archivedAt: (archived ?? true) ? new Date() : null })
          .where(eq(todos.id, id))
          .returning();

        if (!updatedTodo) {
          throw new GraphQLError("could not archive todo");
        }

        return updatedTodo;
      },
    }),

    deleteTodo: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
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

        await db.delete(todos).where(eq(todos.id, id));

        return "successfully deleted todo";
      },
    }),
  }),
});
