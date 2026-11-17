import { getOllamaClient, getVisionModelForUser } from "@repo/ai";
import { ToolInputError } from "../../../model";
import { readFileBuffer } from "./storage";

const DEFAULT_TIMEOUT_MS = 120_000;

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`vision request timed out after ${ms / 1000}s`)),
      ms,
    );

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

/**
 * Sends an image to the configured Ollama vision model.
 *
 * Callers should treat failures as non-fatal: image metadata and preview URLs
 * are still useful when the vision model is unavailable.
 */
export async function describeImageFile(
  file: ImageFile,
  options: {
    userId: number;
    kind: "description" | "ocr";
    prompt?: string;
    maxBytes?: number;
  },
): Promise<ImageVisionResult> {
  const model = await getVisionModelForUser(options.userId);
  const buffer = await readFileBuffer(file.relativePath, {
    maxBytes: options.maxBytes,
  });

  const client = await getOllamaClient();
  const response = await withTimeout(
    client.generate({
      model,
      prompt: options.prompt?.trim() || defaultVisionPrompt(options.kind),
      images: [buffer.toString("base64")],
      stream: false,
    }),
    DEFAULT_TIMEOUT_MS,
  );

  const text = response.response?.trim();
  if (!text) {
    throw new ToolInputError(`Vision model "${model}" returned no text`);
  }

  return { model, text, kind: options.kind };
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
  const results = await Promise.allSettled(
    options.requests.map((request) =>
      describeImageFile(file, {
        userId: options.userId,
        kind: request.kind,
        prompt: request.prompt,
        maxBytes: options.maxBytes,
      }),
    ),
  );

  const text: ImageVisionText = {};
  const failures: string[] = [];

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      failures.push(`${options.requests[index]!.kind}: ${reason}`);
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
