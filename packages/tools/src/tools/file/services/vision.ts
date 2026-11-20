import {
  ensureModelLoaded,
  getOllamaClient,
  getOllamaKeepAlive,
  getVisionModelForUser,
} from "@repo/ai";
import { ToolInputError } from "../../../model";
import { readFileBuffer } from "./storage";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** Inference budget. Model loading is awaited separately below. */
const VISION_TIMEOUT_MS = envInt("VISION_TIMEOUT_MS", 120_000);

/** Loading a large vision model can take much longer than one inference. */
const MODEL_LOAD_TIMEOUT_MS = envInt("MODEL_LOAD_TIMEOUT_MS", 300_000);

export interface ImageVisionResult {
  model: string;
  text: string;
  kind: "description" | "ocr";
}

export interface ImageVisionText {
  description?: string;
  ocr?: string;
  model?: string;
}

export interface ImageVisionRequest {
  kind: ImageVisionResult["kind"];
  prompt?: string;
}

interface ImageFile {
  name: string;
  relativePath: string;
  mimeType: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

export function defaultVisionPrompt(kind: "description" | "ocr"): string {
  if (kind === "ocr") {
    return "Extract all text from this image. Return only the text, preserving line breaks.";
  }

  return "Describe this image in one or two sentences, focusing on the main subject. Do not transcribe visible text.";
}

interface VisionPreparation {
  model: string;
  buffer: Buffer;
  client: Awaited<ReturnType<typeof getOllamaClient>>;
  keepAlive: Awaited<ReturnType<typeof getOllamaKeepAlive>>;
}

/**
 * Resolves the model, image bytes, client, and keep-alive once for all
 * requested outputs. Previously each request repeated this work.
 */
async function prepareVision(
  file: ImageFile,
  options: { userId: number; maxBytes?: number },
): Promise<VisionPreparation> {
  const model = await getVisionModelForUser(options.userId);
  const buffer = await readFileBuffer(file.relativePath, {
    maxBytes: options.maxBytes,
  });
  const client = await getOllamaClient();
  const keepAlive = await getOllamaKeepAlive();

  return { model, buffer, client, keepAlive };
}

/**
 * Runs the requested vision reads. A failure in one request does not discard
 * the other, so description and OCR can succeed independently.
 */
export async function describeImageTexts(
  file: ImageFile,
  options: {
    userId: number;
    requests: ImageVisionRequest[];
    maxBytes?: number;
  },
): Promise<{ text: ImageVisionText; warning?: string }> {
  const failures: string[] = [];
  const text: ImageVisionText = {};

  let prepared: VisionPreparation;
  try {
    prepared = await prepareVision(file, options);
  } catch (err) {
    const reason = errorMessage(err);
    return {
      text,
      warning: `Vision failed: ${options.requests
        .map((request) => `${request.kind}: ${reason}`)
        .join("; ")}`,
    };
  }

  const { model, buffer, client, keepAlive } = prepared;
  const keepAliveOption =
    keepAlive !== undefined ? { keep_alive: keepAlive } : {};

  // Load before starting the inference timer, so a slow first load no longer
  // looks like an inference timeout. If warmup fails we still try the request.
  try {
    await ensureModelLoaded(model, { timeoutMs: MODEL_LOAD_TIMEOUT_MS });
  } catch (err) {
    console.warn(
      `[vision] could not load model "${model}": ${errorMessage(err)}`,
    );
  }

  const results = await Promise.allSettled(
    options.requests.map(async (request) => {
      const response = await withTimeout(
        client.generate({
          model,
          prompt: request.prompt?.trim() || defaultVisionPrompt(request.kind),
          images: [buffer.toString("base64")],
          stream: false,
          ...keepAliveOption,
        }),
        VISION_TIMEOUT_MS,
        `vision request timed out after ${VISION_TIMEOUT_MS / 1000}s`,
      );

      const responseText = response.response?.trim();
      if (!responseText) {
        throw new ToolInputError(`Vision model "${model}" returned no text`);
      }

      return { model, text: responseText, kind: request.kind };
    }),
  );

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      failures.push(
        `${options.requests[index]!.kind}: ${errorMessage(result.reason)}`,
      );
      continue;
    }

    text[result.value.kind] = result.value.text;
    text.model ??= result.value.model;
  }

  return {
    text,
    ...(failures.length > 0
      ? { warning: `Vision failed: ${failures.join("; ")}` }
      : {}),
  };
}
