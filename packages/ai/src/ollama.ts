import { Ollama } from "ollama";
import { getAppSettings } from "@repo/db";

let cachedClient: { baseUrl: string; client: Ollama } | null = null;

/** Current Ollama endpoint, which can be changed from the Settings page. */
export async function getOllamaBaseUrl(): Promise<string> {
  const settings = await getAppSettings();
  return settings.ollamaBaseUrl;
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
