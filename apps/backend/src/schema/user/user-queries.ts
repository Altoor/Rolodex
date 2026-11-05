import { builder, db } from "../builder";
import { SimpleUser, User } from "./user";
import { ensureUserSettings } from "./user-settings-service";

builder.queryType({
  fields: (t) => ({
    users: t.drizzleField({
      type: [SimpleUser],
      resolve: () => db.query.users.findMany(),
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
