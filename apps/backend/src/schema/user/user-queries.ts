import { eq } from "drizzle-orm";
import { users } from "../../db";
import { builder, db } from "../builder";
import { User } from "./user";
import jwt from "jsonwebtoken";

builder.queryType({
  fields: (t) => ({
    users: t.drizzleField({
      type: [User],
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
      description: "ony user name right now",
      args: {
        name: t.arg({ type: "String", required: true }),
      },
      resolve: async (_root, { name }) => {
        const user = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.name, name));
        if (!user) return "user not found";
        jwt.sign({ aud: user[0]?.id, user: user[0] }, process.env.TOKEN_SECRET);
      },
    }),
  }),
});
