import { builder } from "../builder";
import { User } from "./user";
import { createUser, getUserByEmail, updateUser } from "./user-service";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { GraphQLError } from "graphql";

builder.mutationType({
  fields: (t) => ({
    createUser: t.field({
      type: "String",
      args: {
        name: t.arg.string({ required: true }),
        email: t.arg.string({ required: true }),
        password: t.arg.string({ required: true }),
      },
      resolve: async (_root, { name, email, password }, _ctx) => {
        const user = await createUser(email, name, password);

        return jwt.sign({ aud: user.id, user: user }, process.env.TOKEN_SECRET);
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

    login: t.field({
      type: "String",
      description: "login with email and password",
      args: {
        email: t.arg({ type: "String", required: true }),
        password: t.arg({ type: "String", required: true }),
      },
      resolve: async (_root, { email, password }) => {
        const user = await getUserByEmail(email);

        if (bcrypt.compareSync(password, user.hashedPassword!)) {
          return jwt.sign(
            { aud: user.id, user: user },
            process.env.TOKEN_SECRET,
          );
        } else {
          throw new GraphQLError("Incorrect password", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }
      },
    }),
  }),
});
