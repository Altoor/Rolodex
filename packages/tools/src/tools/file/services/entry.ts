import { and, asc, eq, isNull } from "drizzle-orm";
import { db, fileEntries } from "@repo/db";
import { fileEntryEmbeddingText, tryEmbedText } from "@repo/ai";

export type FileEntryRow = typeof fileEntries.$inferSelect;
export type NewFileEntryRow = typeof fileEntries.$inferInsert;

export interface FileEntryEmbeddingSource {
  id: number;
  name: string;
  relativePath: string;
  description: string;
}

/** Loads one live (or optionally deleted) entry by id. */
export async function getFileEntryById(
  id: number,
  options: { includeDeleted?: boolean } = {},
): Promise<FileEntryRow | null> {
  const rows = await db
    .select()
    .from(fileEntries)
    .where(
      and(
        eq(fileEntries.id, id),
        options.includeDeleted ? undefined : isNull(fileEntries.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/** Loads one live (or optionally deleted) entry by relative path. */
export async function getFileEntryByPath(
  relativePath: string,
  options: { includeDeleted?: boolean } = {},
): Promise<FileEntryRow | null> {
  const rows = await db
    .select()
    .from(fileEntries)
    .where(
      and(
        eq(fileEntries.relativePath, relativePath),
        options.includeDeleted ? undefined : isNull(fileEntries.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Lists entries. `parentId: null` selects the root level; omitting it selects
 * the whole tree. Results are ordered for deterministic tree rendering.
 */
export async function listFileEntries(
  options: {
    parentId?: number | null;
    includeDeleted?: boolean;
  } = {},
): Promise<FileEntryRow[]> {
  const conditions = [
    options.includeDeleted ? undefined : isNull(fileEntries.deletedAt),
  ];

  if (options.parentId !== undefined) {
    conditions.push(
      options.parentId === null
        ? isNull(fileEntries.parentId)
        : eq(fileEntries.parentId, options.parentId),
    );
  }

  return db
    .select()
    .from(fileEntries)
    .where(and(...conditions))
    .orderBy(asc(fileEntries.parentId), asc(fileEntries.name));
}

/** Returns direct children of a folder, or root entries when id is null. */
export async function listFileEntryChildren(
  parentId: number | null,
): Promise<FileEntryRow[]> {
  return listFileEntries({ parentId });
}

/** Inserts a new entry and returns the stored row. */
export async function insertFileEntry(
  values: NewFileEntryRow,
): Promise<FileEntryRow> {
  const [row] = await db.insert(fileEntries).values(values).returning();
  if (!row) throw new Error("failed to insert file entry");
  return row;
}

/** Updates an entry's metadata row. `updatedAt` is always refreshed. */
export async function updateFileEntryRow(
  id: number,
  values: Partial<NewFileEntryRow>,
): Promise<FileEntryRow> {
  const [row] = await db
    .update(fileEntries)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(fileEntries.id, id))
    .returning();

  if (!row) throw new Error(`file entry ${id} not found`);
  return row;
}

/**
 * Computes and stores the embedding for an entry. Embedding failures (for
 * example, Ollama being down) are swallowed so filesystem operations still
 * succeed; the backfill script can repair missing vectors later.
 */
export async function saveFileEntryWithEmbedding(
  entry: FileEntryEmbeddingSource,
): Promise<void> {
  const embedding = await tryEmbedText(fileEntryEmbeddingText(entry));
  if (!embedding) return;

  await db
    .update(fileEntries)
    .set({ embedding })
    .where(eq(fileEntries.id, entry.id));
}

/** Loads an entry and refreshes its embedding from the current row. */
export async function refreshFileEntryEmbedding(
  id: number,
): Promise<FileEntryRow | null> {
  const row = await getFileEntryById(id);
  if (!row) return null;

  await saveFileEntryWithEmbedding(row);
  return row;
}

/** Soft-deletes an entry so scans can report removals without unique clashes. */
export async function softDeleteFileEntryRow(
  id: number,
  when: Date = new Date(),
): Promise<FileEntryRow> {
  return updateFileEntryRow(id, { deletedAt: when });
}

/** Permanently removes a DB row (used by smoke tests and hard deletes). */
export async function hardDeleteFileEntryRow(id: number): Promise<void> {
  await db.delete(fileEntries).where(eq(fileEntries.id, id));
}
