import { getOllamaClient, getOllamaKeepAlive } from "@repo/ai";
import type { PromptOptions, PromptResult } from "./types";

/** Sends one prompt to Ollama and rejects empty answers. */
export async function runPrompt(options: PromptOptions): Promise<PromptResult> {
  const keepAlive = await getOllamaKeepAlive();
  const response = await (
    await getOllamaClient()
  ).generate({
    model: options.model,
    prompt: options.prompt,
    system: options.system,
    format: options.format,
    ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
  });

  const text = response.response;
  if (!text || !text.trim()) {
    throw new Error(`Model "${options.model}" returned an empty response`);
  }

  return {
    text,
    thinking: response.thinking,
    model: options.model,
  };
}
