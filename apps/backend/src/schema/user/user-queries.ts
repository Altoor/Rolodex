import { builder, db } from "../builder";
import { SimpleUser, User } from "./user";

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
  }),
});
