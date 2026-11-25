import { resetModelWarmupCache } from "@repo/ai";
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
        maxParallelTasks: t.arg.int({ required: false }),
        ollamaKeepAlive: t.arg.string({ required: false }),
        preloadModels: t.arg.boolean({ required: false }),
        warmModelsOnStartup: t.arg.boolean({ required: false }),
      },
      resolve: async (_root, args, ctx) => {
        requireUserId(ctx);
        const updated = await updateAppSettingsForApi({
          ollamaBaseUrl: args.ollamaBaseUrl ?? undefined,
          transcriberBackend: args.transcriberBackend ?? undefined,
          whisperApiUrl: args.whisperApiUrl ?? undefined,
          whisperModel: args.whisperModel,
          maxParallelTasks: args.maxParallelTasks ?? undefined,
          ollamaKeepAlive: args.ollamaKeepAlive,
          preloadModels: args.preloadModels ?? undefined,
          warmModelsOnStartup: args.warmModelsOnStartup ?? undefined,
        });

        // Endpoint/keep-alive changes invalidate the in-process warm state.
        resetModelWarmupCache();
        return updated;
      },
    }),
  }),
});
