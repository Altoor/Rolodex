import { ollama } from "./Ollama";

export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "nomic-embed-text";

export const EMBEDDING_DIMENSIONS = 768;

export function todoEmbeddingText(todo: {
  name: string;
  description: string;
}): string {
  return `${todo.name}\n\n${todo.description}`;
}

export async function embedText(text: string): Promise<number[]> {
  const response = await ollama.embed({
    model: EMBEDDING_MODEL,
    input: text,
  });

  const vector = response.embeddings[0];
  if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embedding model "${EMBEDDING_MODEL}" returned ${vector?.length ?? 0} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
    );
  }

  return vector;
}

export async function tryEmbedText(text: string): Promise<number[] | null> {
  try {
    return await embedText(text);
  } catch (err) {
    console.warn("todo embedding failed:", err);
    return null;
  }
}
