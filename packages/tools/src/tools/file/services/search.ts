import {
  and,
  cosineDistance,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { db, fileEntries } from "@repo/db";
import { getDecisionModelForUser, tryEmbedText } from "@repo/ai";
import { mergeToolInput, readNumber, readString } from "../../../utils";
import { ToolInputError, type ToolRunContext } from "../../../model";
import {
  getFileEntryById,
  getFileEntryByPath,
  type FileEntryRow,
} from "./entry";
import { normalizeRelativePath } from "./paths";
import { selectFileEntryWithDecision } from "./selection";
import { toFileEntryRef, type FileEntryCandidate } from "./dto";

export type FileEntryKind = "file" | "folder";

export interface FileMatches {
  /** Highest-scoring candidate. */
  entry: FileEntryCandidate;
  /** All candidates, ordered by score. */
  candidates: FileEntryCandidate[];
}

export interface FindFileMatchesOptions {
  kind?: FileEntryKind;
  limit?: number;
}

/**
 * Resolves file/folder candidates with the same strategy used by the todo
 * tools: explicit id, explicit path, vector search, lexical fallback, then the
 * decision-model selector.
 */
export async function findFileMatches(
  context: ToolRunContext,
  options: FindFileMatchesOptions = {},
): Promise<FileMatches> {
  const input = mergeToolInput(context);
  const kind = options.kind;
  const label = kind ?? "file or folder";

  const explicitId = readEmbeddedId(input, kind);
  if (explicitId !== undefined) {
    const row = await getFileEntryById(explicitId);
    if (!row || (kind !== undefined && row.kind !== kind)) {
      throw new ToolInputError(`${label} ${explicitId} not found`);
    }
    return singleCandidate(row);
  }

  const explicitPath = readEmbeddedPath(input, kind);
  if (explicitPath !== undefined) {
    const normalized = normalizeRelativePath(explicitPath);
    const row = await getFileEntryByPath(normalized);
    if (!row || (kind !== undefined && row.kind !== kind)) {
      throw new ToolInputError(`${label} "${normalized}" not found`);
    }
    return singleCandidate(row);
  }

  const queryText = readString(input, "query") ?? context.state;
  if (!queryText || !queryText.trim()) {
    throw new ToolInputError(`${label} lookup requires a query, id, or path`);
  }

  const limit = Math.max(
    1,
    Math.floor(readNumber(input, "limit") ?? options.limit ?? 5),
  );

  const kindCondition =
    kind !== undefined ? eq(fileEntries.kind, kind) : undefined;
  const live = isNull(fileEntries.deletedAt);

  let candidates: FileEntryCandidate[] = [];

  const queryEmbedding = await tryEmbedText(queryText);

  if (queryEmbedding) {
    const distance = cosineDistance(fileEntries.embedding, queryEmbedding);

    const ranked = await db
      .select({ id: fileEntries.id, distance })
      .from(fileEntries)
      .where(and(kindCondition, live, isNotNull(fileEntries.embedding)))
      .orderBy(distance)
      .limit(limit);

    const rows =
      ranked.length > 0
        ? await db
            .select()
            .from(fileEntries)
            .where(
              inArray(
                fileEntries.id,
                ranked.map((row) => row.id),
              ),
            )
        : [];

    const rowById = new Map(rows.map((row) => [row.id, row]));

    candidates = ranked.flatMap((rankedRow) => {
      const row = rowById.get(rankedRow.id);
      if (!row) return [];
      return [
        {
          ...toFileEntryRef(row),
          score: 1 - Number(rankedRow.distance),
        },
      ];
    });
  }

  if (candidates.length === 0) {
    const pattern = `%${queryText}%`;

    const rows = await db
      .select()
      .from(fileEntries)
      .where(
        and(
          kindCondition,
          live,
          or(
            ilike(fileEntries.name, pattern),
            ilike(fileEntries.description, pattern),
            ilike(fileEntries.relativePath, pattern),
          ),
        ),
      )
      .limit(limit);

    candidates = rows.map((row) => ({
      ...toFileEntryRef(row),
      score: 1,
    }));
  }

  if (candidates.length === 0) {
    const model =
      readString(input, "decisionModel") ??
      context.decisionModel ??
      (await getDecisionModelForUser(context.userId));

    const rows = await db
      .select()
      .from(fileEntries)
      .where(and(kindCondition, live));

    if (rows.length === 0) {
      throw new ToolInputError(`no matching ${label} found`);
    }

    const selected = await selectFileEntryWithDecision(
      rows,
      queryText,
      model,
      kind,
    );

    candidates = [
      {
        ...toFileEntryRef(selected),
        score: 1,
      },
    ];
  }

  candidates.sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (!best) {
    throw new ToolInputError(`no matching ${label} found`);
  }

  return { entry: best, candidates };
}

/** Resolves a DB row rather than only the public DTO. */
export async function resolveFileEntryRow(
  context: ToolRunContext,
  options: FindFileMatchesOptions = {},
): Promise<FileEntryRow> {
  const { entry } = await findFileMatches(context, options);
  const row = await getFileEntryById(entry.id);

  if (!row) {
    throw new ToolInputError(`file entry ${entry.id} not found`);
  }

  return row;
}

function singleCandidate(row: FileEntryRow): FileMatches {
  const candidate: FileEntryCandidate = {
    ...toFileEntryRef(row),
    score: 1,
  };

  return { entry: candidate, candidates: [] };
}

/**
 * Reads an id from the expected kind's tool-state shape. Filtering by kind is
 * deliberate: a folder in toolState must not hijack a find_file lookup.
 */
function readEmbeddedId(
  input: Record<string, unknown>,
  kind?: FileEntryKind,
): number | undefined {
  const scalarKeys =
    kind === "file"
      ? ["id", "fileId", "entryId"]
      : kind === "folder"
        ? ["id", "folderId", "entryId"]
        : ["id", "fileId", "folderId", "entryId"];

  for (const key of scalarKeys) {
    const value = readNumber(input, key);
    if (value !== undefined) return value;
  }

  for (const record of embeddedRecords(input, kind)) {
    const id =
      readNumber(record, "id") ??
      readNumber(record, "fileId") ??
      readNumber(record, "folderId") ??
      readNumber(record, "entryId");

    if (id !== undefined) return id;
  }

  return undefined;
}

/** Reads a relative path from the expected kind's tool-state shape. */
function readEmbeddedPath(
  input: Record<string, unknown>,
  kind?: FileEntryKind,
): string | undefined {
  const direct = readString(input, "path");
  if (direct && direct.trim()) return direct;

  for (const record of embeddedRecords(input, kind)) {
    const path =
      readString(record, "path") ?? readString(record, "relativePath");

    if (path && path.trim()) return path;
  }

  return undefined;
}

function embeddedRecords(
  input: Record<string, unknown>,
  kind?: FileEntryKind,
): Record<string, unknown>[] {
  const keys =
    kind === "file"
      ? ["file", "files", "entry", "entries"]
      : kind === "folder"
        ? ["folder", "folders", "entry", "entries"]
        : ["file", "files", "folder", "folders", "entry", "entries"];

  const records: Record<string, unknown>[] = [];

  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const record = matchingRecord(item, kind);
        if (record) records.push(record);
      }
      continue;
    }

    const record = matchingRecord(value, kind);
    if (record) records.push(record);
  }

  return records;
}

function matchingRecord(
  value: unknown,
  kind?: FileEntryKind,
): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    kind !== undefined &&
    (record.kind === "file" || record.kind === "folder") &&
    record.kind !== kind
  ) {
    return null;
  }

  return record;
}
