import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { db } from "../schema/builder";
import { todos } from "@repo/db";
import { embedText, todoEmbeddingText } from "@repo/ai";

async function main(): Promise<void> {
  const missing = await db
    .select({
      id: todos.id,
      name: todos.name,
      description: todos.description,
    })
    .from(todos)
    .where(isNull(todos.descriptionEmbedding));

  console.info(`Backfilling embeddings for ${missing.length} todo(s)...`);

  let updated = 0;
  let failed = 0;

  for (const todo of missing) {
    try {
      const embedding = await embedText(todoEmbeddingText(todo));

      await db
        .update(todos)
        .set({ descriptionEmbedding: embedding })
        .where(eq(todos.id, todo.id));

      updated += 1;
      console.info(`Updated todo ${todo.id} ("${todo.name}")`);
    } catch (err) {
      failed += 1;
      console.warn(
        `Failed to embed todo ${todo.id} ("${todo.name}"):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.info(`Backfill complete: ${updated} updated, ${failed} failed.`);
}

void main().catch((err) => {
  console.error("Embedding backfill failed:", err);
  process.exitCode = 1;
});
