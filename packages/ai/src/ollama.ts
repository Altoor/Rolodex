import { Ollama } from "ollama";
import { getAppSettings } from "@repo/db";

let cachedClient: { baseUrl: string; client: Ollama } | null = null;

export type OllamaKeepAlive = string | number;

/** Current Ollama endpoint, which can be changed from the Settings page. */
export async function getOllamaBaseUrl(): Promise<string> {
  const settings = await getAppSettings();
  return settings.ollamaBaseUrl;
}

/**
 * Parses the stored keep-alive value. `null`/empty means "do not send one", so
 * the Ollama server's own OLLAMA_KEEP_ALIVE setting applies. This is important
 * for deployments where the compose file configures the server: the app must
 * not override that value unless the user explicitly sets one.
 */
export function parseOllamaKeepAlive(
  value: string | null | undefined,
): OllamaKeepAlive | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

/** Keep-alive to send with a request, or undefined to use the server default. */
export async function getOllamaKeepAlive(): Promise<
  OllamaKeepAlive | undefined
> {
  const settings = await getAppSettings();
  return parseOllamaKeepAlive(settings.ollamaKeepAlive);
}

/**
 * Returns a client for the configured Ollama endpoint. The client is cached by
 * URL, so changing the setting takes effect on the next call without a restart.
 */
export async function getOllamaClient(): Promise<Ollama> {
  const baseUrl = await getOllamaBaseUrl();

  if (!cachedClient || cachedClient.baseUrl !== baseUrl) {
    cachedClient = { baseUrl, client: new Ollama({ host: baseUrl }) };
  }

  return cachedClient.client;
}

/**
 * const client = await getOllamaClient();
 * const response = await client.generate({
 *   model: "gemma4:e4b",
 *   prompt: "...",
 * });
 */
