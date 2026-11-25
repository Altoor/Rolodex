import {
  getOllamaKeepAlive,
  getOllamaBaseUrl,
  getOllamaClient,
} from "./ollama";
import type { OllamaKeepAlive } from "./ollama";

export type WarmupKind = "generate" | "embed";

export interface WarmupOptions {
  keepAlive?: OllamaKeepAlive;
  /** Defaults to MODEL_LOAD_TIMEOUT_MS (300s). */
  timeoutMs?: number;
  /**
   * Embedding-only models must be loaded with `/api/embed`; text and vision
   * models use `/api/generate`.
   */
  kind?: WarmupKind;
}

export const DEFAULT_MODEL_LOAD_TIMEOUT_MS = readEnvInt(
  "MODEL_LOAD_TIMEOUT_MS",
  300_000,
);

/** Skip a repeated `ps()`/load within this window after a successful warmup. */
const RECENT_WARM_TTL_MS = 10_000;

/** Treat a model that expires within this window as cold. */
const MIN_REMAINING_LIFETIME_MS = 30_000;

// Keyed by `baseUrl|model`, so changing the Ollama endpoint starts fresh.
const inFlight = new Map<string, Promise<void>>();
const recentlyWarmed = new Map<string, number>();

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Ollama reports untagged models as `name:latest`, but callers often pass the
 * bare name (the embedding model is configured as `nomic-embed-text`).
 */
function normalizeModelName(name: string): string {
  return name.includes(":") ? name : `${name}:latest`;
}

/** Whether Ollama already reports the model as loaded and not about to expire. */
async function isModelLoaded(model: string): Promise<boolean> {
  try {
    const client = await getOllamaClient();
    const { models } = await client.ps();
    const now = Date.now();
    const target = normalizeModelName(model);

    return models.some((entry) => {
      if (
        normalizeModelName(entry.name) !== target &&
        normalizeModelName(entry.model) !== target
      ) {
        return false;
      }

      const expiresAt = entry.expires_at
        ? new Date(entry.expires_at).getTime()
        : Number.NaN;

      // Older Ollama versions may not report an expiry; trust that it is warm.
      return (
        !Number.isFinite(expiresAt) ||
        expiresAt - now > MIN_REMAINING_LIFETIME_MS
      );
    });
  } catch (err) {
    // `ps()` is best-effort. A failure only means we try the warmup request.
    console.warn(`[ollama] could not list loaded models: ${errorMessage(err)}`);
    return false;
  }
}

async function loadModel(model: string, options: WarmupOptions): Promise<void> {
  const keepAlive = options.keepAlive ?? (await getOllamaKeepAlive());
  const timeoutMs = options.timeoutMs ?? DEFAULT_MODEL_LOAD_TIMEOUT_MS;
  const kind = options.kind ?? "generate";
  const client = await getOllamaClient();
  const startedAt = Date.now();

  console.info(`[ollama] loading ${kind} model "${model}"`);

  const keepAliveOption =
    keepAlive !== undefined ? { keep_alive: keepAlive } : {};

  if (kind === "embed") {
    await withTimeout(
      client.embed({
        model,
        input: "warmup",
        ...keepAliveOption,
      }),
      timeoutMs,
      `embedding model "${model}" did not load within ${timeoutMs / 1000}s`,
    );
  } else {
    // An empty prompt asks Ollama to load the model without generating text.
    await withTimeout(
      client.generate({
        model,
        prompt: "",
        stream: false,
        options: { num_predict: 1 },
        ...keepAliveOption,
      }),
      timeoutMs,
      `model "${model}" did not load within ${timeoutMs / 1000}s`,
    );
  }

  console.info(
    `[ollama] loaded ${kind} model "${model}" in ${Date.now() - startedAt}ms`,
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Ensures a model is loaded, waiting for the load to finish when needed.
 * Concurrent callers for the same model share one request.
 */
export async function ensureModelLoaded(
  model: string,
  options: WarmupOptions = {},
): Promise<void> {
  const baseUrl = await getOllamaBaseUrl();
  const key = `${baseUrl}|${model}`;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const warmedAt = recentlyWarmed.get(key);
  if (warmedAt !== undefined && Date.now() - warmedAt < RECENT_WARM_TTL_MS) {
    return;
  }

  // Register the promise before the first await so concurrent callers share
  // one `ps()` check and one load request.
  const promise = (async () => {
    if (await isModelLoaded(model)) return;
    await loadModel(model, options);
  })();
  inFlight.set(key, promise);

  try {
    await promise;
    recentlyWarmed.set(key, Date.now());
  } finally {
    inFlight.delete(key);
  }
}

/** Warmup that never throws; failures are logged and the task continues. */
export function warmModelInBackground(
  model: string,
  options: WarmupOptions = {},
): void {
  void ensureModelLoaded(model, options).catch((err) => {
    console.warn(
      `[ollama] could not preload model "${model}": ${errorMessage(err)}`,
    );
  });
}

/** Clears in-process warmup state, for example after a settings change. */
export function resetModelWarmupCache(): void {
  inFlight.clear();
  recentlyWarmed.clear();
}
