import { builder } from "../builder";
import { requireUserId } from "../auth";
import { AppSettings, TranscriberBackend } from "./app-settings";
import { updateAppSettingsForApi } from "./app-settings-service";

builder.mutationType({
  fields: (t) => ({
    updateAppSettings: t.field({
      type: AppSettings,
      args: {
        ollamaBaseUrl: t.arg.string({ required: false }),
        transcriberBackend: t.arg({
          type: TranscriberBackend,
          required: false,
        }),
        whisperApiUrl: t.arg.string({ required: false }),
        whisperModel: t.arg.string({ required: false }),
      },
      resolve: (_root, args, ctx) => {
        requireUserId(ctx);
        return updateAppSettingsForApi({
          ollamaBaseUrl: args.ollamaBaseUrl ?? undefined,
          transcriberBackend: args.transcriberBackend ?? undefined,
          whisperApiUrl: args.whisperApiUrl ?? undefined,
          whisperModel: args.whisperModel,
        });
      },
    }),
  }),
});
