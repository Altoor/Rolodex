import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { UserSettings } from "./user-settings";
import { updateUserSettings as updateSettings } from "./user-settings-service";

builder.mutationType({
  fields: (t) => ({
    updateUserSettings: t.field({
      type: UserSettings,
      args: {
        defaultTaskId: t.arg.int(),
        defaultModelName: t.arg.string(),
      },
      resolve: async (_root, args, ctx) => {
        const user = (ctx as any).user;

        if (!user?.id) {
          throw new GraphQLError("Not logged in", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        return updateSettings(user.id, {
          defaultTaskId: args.defaultTaskId,
          defaultModelName: args.defaultModelName,
        });
      },
    }),
  }),
});
