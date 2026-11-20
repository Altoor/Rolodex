import { eq } from "drizzle-orm";
import { db } from "./client";
import { appSettings } from "./schema";

export type TranscriberBackend = "whisper_cpp" | "faster_whisper";

export interface AppSettingsValues {
  ollamaBaseUrl: string;
  transcriberBackend: TranscriberBackend;
  whisperApiUrl: string;
  whisperModel: string | null;
  maxParallelTasks: number;
  /** Null means "use the Ollama server's own OLLAMA_KEEP_ALIVE". */
  ollamaKeepAlive: string | null;
  preloadModels: boolean;
  warmModelsOnStartup: boolean;
  updatedAt: Date | null;
}

export interface UpdateAppSettingsInput {
  ollamaBaseUrl?: string;
  transcriberBackend?: TranscriberBackend;
  whisperApiUrl?: string;
  whisperModel?: string | null;
  maxParallelTasks?: number;
  ollamaKeepAlive?: string | null;
  preloadModels?: boolean;
  warmModelsOnStartup?: boolean;
}

export const DEFAULT_MAX_PARALLEL_TASKS = 5;

const DEFAULT_OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";

const DEFAULT_WHISPER_API_URL =
  process.env.WHISPER_API_URL?.trim() ||
  "http://127.0.0.1:9000/v1/audio/transcriptions";

const DEFAULT_TRANSCRIBER_BACKEND: TranscriberBackend =
  process.env.WHISPER_BACKEND === "whisper_cpp"
    ? "whisper_cpp"
    : "faster_whisper";

const DEFAULT_WHISPER_MODEL = process.env.WHISPER_MODEL?.trim() || null;

function defaults(): AppSettingsValues {
  return {
    ollamaBaseUrl: DEFAULT_OLLAMA_BASE_URL,
    transcriberBackend: DEFAULT_TRANSCRIBER_BACKEND,
    whisperApiUrl: DEFAULT_WHISPER_API_URL,
    whisperModel: DEFAULT_WHISPER_MODEL,
    maxParallelTasks: DEFAULT_MAX_PARALLEL_TASKS,
    ollamaKeepAlive: null,
    preloadModels: true,
    warmModelsOnStartup: false,
    updatedAt: null,
  };
}

/** Reads the singleton settings row, falling back to environment defaults. */
export async function getAppSettings(): Promise<AppSettingsValues> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);

  const fallback = defaults();
  if (!row) return fallback;

  return {
    ollamaBaseUrl: row.ollamaBaseUrl.trim() || fallback.ollamaBaseUrl,
    transcriberBackend: row.transcriberBackend || fallback.transcriberBackend,
    whisperApiUrl: row.whisperApiUrl.trim() || fallback.whisperApiUrl,
    whisperModel: row.whisperModel?.trim() || fallback.whisperModel,
    maxParallelTasks:
      row.maxParallelTasks > 0
        ? row.maxParallelTasks
        : fallback.maxParallelTasks,
    ollamaKeepAlive: row.ollamaKeepAlive?.trim() || null,
    preloadModels: row.preloadModels ?? fallback.preloadModels,
    warmModelsOnStartup:
      row.warmModelsOnStartup ?? fallback.warmModelsOnStartup,
    updatedAt: row.updatedAt,
  };
}

/** Merges a partial update into the singleton row and returns the result. */
export async function updateAppSettings(
  input: UpdateAppSettingsInput,
): Promise<AppSettingsValues> {
  const current = await getAppSettings();

  const next = {
    ollamaBaseUrl:
      input.ollamaBaseUrl === undefined
        ? current.ollamaBaseUrl
        : input.ollamaBaseUrl.trim(),
    transcriberBackend:
      input.transcriberBackend === undefined
        ? current.transcriberBackend
        : input.transcriberBackend,
    whisperApiUrl:
      input.whisperApiUrl === undefined
        ? current.whisperApiUrl
        : input.whisperApiUrl.trim(),
    whisperModel:
      input.whisperModel === undefined
        ? current.whisperModel
        : input.whisperModel?.trim() || null,
    maxParallelTasks:
      input.maxParallelTasks === undefined
        ? current.maxParallelTasks
        : input.maxParallelTasks,
    ollamaKeepAlive:
      input.ollamaKeepAlive === undefined
        ? current.ollamaKeepAlive
        : input.ollamaKeepAlive?.trim() || null,
    preloadModels:
      input.preloadModels === undefined
        ? current.preloadModels
        : input.preloadModels,
    warmModelsOnStartup:
      input.warmModelsOnStartup === undefined
        ? current.warmModelsOnStartup
        : input.warmModelsOnStartup,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(appSettings)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: next,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to update app settings");
  }

  return {
    ollamaBaseUrl: row.ollamaBaseUrl.trim() || defaults().ollamaBaseUrl,
    transcriberBackend: row.transcriberBackend,
    whisperApiUrl: row.whisperApiUrl.trim() || defaults().whisperApiUrl,
    whisperModel: row.whisperModel?.trim() || defaults().whisperModel,
    maxParallelTasks:
      row.maxParallelTasks > 0
        ? row.maxParallelTasks
        : defaults().maxParallelTasks,
    ollamaKeepAlive: row.ollamaKeepAlive?.trim() || null,
    preloadModels: row.preloadModels ?? defaults().preloadModels,
    warmModelsOnStartup:
      row.warmModelsOnStartup ?? defaults().warmModelsOnStartup,
    updatedAt: row.updatedAt,
  };
}
