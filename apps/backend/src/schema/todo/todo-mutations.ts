import { eq } from "drizzle-orm";
import { todos, users } from "@repo/db";
import { builder, db } from "../builder";
import { Todo } from "./todo";
import { GraphQLError } from "graphql/error";
import { requireUserId } from "../auth";
import { canManageTodo } from "@repo/tools/tools/todo/services/permissions";
import { saveTodoWithEmbedding } from "@repo/tools/tools/todo/services/todo";

type TodoRow = typeof todos.$inferSelect;

/** Loads a todo the user is allowed to see (author or assigned actor). */
async function findVisibleTodo(userId: number, id: number): Promise<TodoRow> {
  const todo = await db.query.todos.findFirst({
    where: {
      AND: [
        {
          OR: [{ actorId: userId }, { authorId: userId }],
        },
        { id },
      ],
    },
  });

  if (!todo) {
    throw new GraphQLError("no todo found");
  }

  return todo;
}

async function assertUserExists(userId: number): Promise<void> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new GraphQLError(`actor_id ${userId} does not reference a user`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
}

/**
 * Editing, archiving, deleting, and reassigning the actor are author-only.
 * Actors may only toggle done, so this rejects them with a clear error instead
 * of silently ignoring the write.
 */
function assertCanManage(
  todo: TodoRow,
  userId: number,
  action: "edit" | "archive" | "delete",
): void {
  if (!canManageTodo(todo, userId)) {
    throw new GraphQLError(`Only the todo's author can ${action} it`, {
      extensions: { code: "FORBIDDEN" },
    });
  }
}

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

        // Creation may assign an actor, but the caller is always the author.
        const actorId = actor_id ?? author_id;
        if (
          actor_id !== null &&
          actor_id !== undefined &&
          actor_id !== author_id
        ) {
          await assertUserExists(actor_id);
        }

        const todo = {
          name,
          description: description ?? "",
          doByDate: doByDate ?? null,
          authorId: author_id,
          actorId,
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
        // Authors and actors may both toggle done; that is the actor's only
        // write. Only the done flag is written, so other fields stay intact.
        await findVisibleTodo(userId, id);

        const [updatedTodo] = await db
          .update(todos)
          .set({ done })
          .where(eq(todos.id, id))
          .returning();

        if (!updatedTodo) {
          throw new GraphQLError("could not update todo");
        }

        return updatedTodo;
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
        const todo = await findVisibleTodo(userId, id);
        assertCanManage(todo, userId, "edit");

        const nextActorId = actor_id ?? todo.actorId;
        if (
          actor_id !== null &&
          actor_id !== undefined &&
          actor_id !== todo.actorId
        ) {
          await assertUserExists(actor_id);
        }

        const todoDto = {
          name: name ?? todo.name,
          description: description ?? todo.description,
          authorId: todo.authorId,
          actorId: nextActorId,
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
        const todo = await findVisibleTodo(userId, id);
        assertCanManage(todo, userId, "archive");

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
        const todo = await findVisibleTodo(userId, id);
        assertCanManage(todo, userId, "delete");

        await db.delete(todos).where(eq(todos.id, id));

        return "successfully deleted todo";
      },
    }),
  }),
});
