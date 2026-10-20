import { builder } from "../builder";
import { User } from "./user";
import { createUser, updateUser } from "./user-service";

builder.mutationType({
  fields: (t) => ({
    createUser: t.drizzleField({
      type: User,
      args: {
        name: t.arg.string({ required: true }),
        email: t.arg.string({ required: true }),
        password: t.arg.string({ required: true }),
      },
      resolve: async (_query, _root, { name, email, password }, _ctx) => {
        const user = await createUser(email, name, password);

        return user;
      },
    }),

    updateUserEmail: t.drizzleField({
      type: User,
      args: {
        id: t.arg.int({ required: true }),
        email: t.arg.string({ required: true }),
      },
      resolve: async (_query, _root, { id, email }, ctx) => {
        const user = updateUser(id, email);

        return user;
      },
    }),

    updateUserName: t.drizzleField({
      type: User,
      args: {
        id: t.arg.int({ required: true }),
        name: t.arg.string({ required: true }),
      },
      resolve: async (_query, _root, { id, name }, ctx) => {
        const user = updateUser(id, undefined, name);

        return user;
      },
    }),

    updateUserPassword: t.drizzleField({
      type: User,
      args: {
        id: t.arg.int({ required: true }),
        password: t.arg.string({ required: true }),
      },
      resolve: async (_query, _root, { id, password }, ctx) => {
        const user = updateUser(id, undefined, undefined, password);

        return user;
      },
    }),
  }),
});
