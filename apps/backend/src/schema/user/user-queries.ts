import bcrypt from "bcrypt";
import { builder, db } from "../builder";
import { SimpleUser, User } from "./user";
import jwt from "jsonwebtoken";
import { getUserByEmail } from "./user-service";
import { GraphQLError } from "graphql";

builder.queryType({
  fields: (t) => ({
    users: t.drizzleField({
      type: [SimpleUser],
      resolve: () => db.query.users.findMany(),
    }),
    me: t.field({
      type: User,
      resolve: (_root, _args, ctx) => {
        return (ctx as any).user;
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
