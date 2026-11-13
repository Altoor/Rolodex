import { builder, db } from "../builder";
import { requireUserId } from "../auth";
import { SimpleUser, User } from "./user";
import { ensureUserSettings } from "./user-settings-service";

builder.queryType({
  fields: (t) => ({
    users: t.drizzleField({
      type: [SimpleUser],
      resolve: (_query, _root, _args, ctx) => {
        requireUserId(ctx);
        return db.query.users.findMany();
      },
    }),
    me: t.field({
      type: User,
      nullable: true,
      resolve: async (_root, _args, ctx) => {
        const user = (ctx as any).user;

        if (!user?.id) return null;

        await ensureUserSettings(user.id);

        return user;
      },
    }),
  }),
});
