import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../schema/builder";
import { fileEntries } from "@repo/db";
import { embedText, fileEntryEmbeddingText } from "@repo/ai";

async function main(): Promise<void> {
  const missing = await db
    .select({
      id: fileEntries.id,
      name: fileEntries.name,
      relativePath: fileEntries.relativePath,
      description: fileEntries.description,
    })
    .from(fileEntries)
    .where(and(isNull(fileEntries.embedding), isNull(fileEntries.deletedAt)));

  console.info(
    `Backfilling embeddings for ${missing.length} file entry(ies)...`,
  );

  let updated = 0;
  let failed = 0;

  for (const entry of missing) {
    try {
      const embedding = await embedText(fileEntryEmbeddingText(entry));

      await db
        .update(fileEntries)
        .set({ embedding })
        .where(eq(fileEntries.id, entry.id));

      updated += 1;
      console.info(`Updated file entry ${entry.id} ("${entry.relativePath}")`);
    } catch (err) {
      failed += 1;
      console.warn(
        `Failed to embed file entry ${entry.id} ("${entry.relativePath}"):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.info(`Backfill complete: ${updated} updated, ${failed} failed.`);
}

void main().catch((err) => {
  console.error("File entry embedding backfill failed:", err);
  process.exitCode = 1;
});
