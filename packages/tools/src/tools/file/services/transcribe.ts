import { getAppSettings } from "@repo/db";
import { ToolInputError } from "../../../model";
import { readFileBuffer } from "./storage";

const DEFAULT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface TranscriptionResult {
  text: string;
  language: string | null;
  duration: number | null;
  segments: unknown[] | null;
  backend: string;
  model: string | null;
}

interface AudioFile {
  name: string;
  relativePath: string;
  mimeType: string | null;
}

function withQuery(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Sends an audio file to the configured Whisper HTTP API.
 *
 * `faster_whisper` uses the OpenAI-compatible multipart shape (`file`).
 * `whisper_cpp` uses the `/asr` shape (`audio_file` + `output=json`), which is
 * what the common whisper.cpp / whisper-asr-webservice containers expose.
 */
export async function transcribeAudioFile(
  file: AudioFile,
  options: {
    language?: string;
    model?: string;
    maxBytes?: number;
  } = {},
): Promise<TranscriptionResult> {
  const settings = await getAppSettings();
  const url = settings.whisperApiUrl.trim();

  if (!url) {
    throw new ToolInputError(
      "Whisper API URL is not configured. Set it on the Settings page.",
    );
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_AUDIO_BYTES;
  const buffer = await readFileBuffer(file.relativePath, { maxBytes });
  const model = options.model?.trim() || settings.whisperModel?.trim() || null;
  const backend = settings.transcriberBackend;

  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: file.mimeType ?? "application/octet-stream",
  });

  if (backend === "whisper_cpp") {
    form.append("audio_file", blob, file.name);
  } else {
    form.append("file", blob, file.name);
    form.append("model", model ?? "whisper-1");
    form.append("response_format", "verbose_json");
  }

  if (options.language) form.append("language", options.language);

  const endpoint =
    backend === "whisper_cpp"
      ? withQuery(url, { output: "json" })
      : url;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new ToolInputError(
        `Whisper API returned ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = (await response.text()).trim();
      if (!text) {
        throw new ToolInputError("Whisper API returned an empty transcript");
      }
      return {
        text,
        language: options.language ?? null,
        duration: null,
        segments: null,
        backend,
        model,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const text =
      typeof payload.text === "string" ? payload.text.trim() : undefined;

    if (!text) {
      throw new ToolInputError("Whisper API returned an empty transcript");
    }

    return {
      text,
      language:
        typeof payload.language === "string"
          ? payload.language
          : (options.language ?? null),
      duration: asNumber(payload.duration),
      segments: Array.isArray(payload.segments) ? payload.segments : null,
      backend,
      model,
    };
  } catch (err) {
    if (err instanceof ToolInputError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ToolInputError(
        `Whisper API timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`,
      );
    }
    throw new ToolInputError(
      `Whisper API request failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timeout);
  }
}
