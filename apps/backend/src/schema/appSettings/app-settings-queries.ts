import { builder } from "../builder";
import { requireUserId } from "../auth";
import { AppSettings } from "./app-settings";
import { getAppSettingsForApi } from "./app-settings-service";

builder.queryType({
  fields: (t) => ({
    appSettings: t.field({
      type: AppSettings,
      resolve: (_root, _args, ctx) => {
        requireUserId(ctx);
        return getAppSettingsForApi();
      },
    }),
  }),
});
