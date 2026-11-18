import { builder } from "../builder";
import type {
  AppSettingsValues,
  TranscriberBackend as TranscriberBackendValue,
} from "@repo/db";

export const TranscriberBackend = builder.enumType("TranscriberBackend", {
  values: ["whisper_cpp", "faster_whisper"] as const,
});

export const AppSettings = builder
  .objectRef<AppSettingsValues>("AppSettings")
  .implement({
    fields: (t) => ({
      ollamaBaseUrl: t.exposeString("ollamaBaseUrl"),
      transcriberBackend: t.field({
        type: TranscriberBackend,
        resolve: (parent) => parent.transcriberBackend,
      }),
      whisperApiUrl: t.exposeString("whisperApiUrl"),
      whisperModel: t.exposeString("whisperModel", { nullable: true }),
      updatedAt: t.field({
        type: "DateTime",
        nullable: true,
        resolve: (parent) => parent.updatedAt,
      }),
    }),
  });

export type { TranscriberBackendValue };
