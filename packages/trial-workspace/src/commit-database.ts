import { eq, sql, type SQL } from "drizzle-orm";
import { fileEntries, todos, type AppDatabase } from "@repo/db";
import { TrialCommitConflictError } from "./types";

type FileEntryRow = typeof fileEntries.$inferSelect;

interface SqlExecutor {
  execute: (query: SQL) => Promise<unknown>;
}

/**
 * Explicit ids copied from the trial do not advance the identity sequence, so
 * the next production insert would collide. `pg_get_serial_sequence` parses
 * its first argument as an identifier, which means camelCase table names must
 * be passed already quoted.
 */
async function advanceIdentitySequence(
  tx: SqlExecutor,
  table: string,
): Promise<void> {
  const qualified = `"${table.replace(/"/g, '""')}"`;
  await tx.execute(
    sql`SELECT setval(
      pg_get_serial_sequence(${qualified}, 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM ${sql.identifier(table)}), 0), 1),
      (SELECT COUNT(*) > 0 FROM ${sql.identifier(table)})
    )`,
  );
}

export interface TrialDatabases {
  /** `search_path=<trialSchema>,public` */
  trial: AppDatabase;
  /** `search_path=<baselineSchema>,public` */
  baseline: AppDatabase;
  /** Production tables. */
  public: AppDatabase;
}

/**
 * Deterministic representation of a row. Drizzle returns Dates and vectors as
 * JavaScript values, so the comparison must handle those explicitly.
 */
function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Buffer.isBuffer(value)) return `buffer:${value.toString("base64")}`;
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

interface RowDiff<T> {
  baselineById: Map<number, T>;
  inserts: T[];
  updates: T[];
  deletes: T[];
}

function diffRows<T extends { id: number }>(
  trial: T[],
  baseline: T[],
): RowDiff<T> {
  const baselineById = new Map(baseline.map((row) => [row.id, row]));
  const trialById = new Map(trial.map((row) => [row.id, row]));

  return {
    baselineById,
    inserts: trial.filter((row) => !baselineById.has(row.id)),
    deletes: baseline.filter((row) => !trialById.has(row.id)),
    updates: trial.filter((row) => {
      const before = baselineById.get(row.id);
      return before !== undefined && stable(before) !== stable(row);
    }),
  };
}

interface AppliedDiff<T> {
  inserts: T[];
  updates: T[];
  deletes: T[];
}

/**
 * Compares the trial diff with the current production rows. Rows that already
 * match the trial are treated as applied so a retried commit is idempotent;
 * any other divergence is a conflict the user can retry.
 */
function planDiff<T extends { id: number }>(
  current: T[],
  diff: RowDiff<T>,
  table: string,
): AppliedDiff<T> {
  const currentById = new Map(current.map((row) => [row.id, row]));
  const alreadyApplied = new Set<number>();

  for (const row of diff.deletes) {
    const currentRow = currentById.get(row.id);
    if (!currentRow) {
      alreadyApplied.add(row.id);
      continue;
    }
    const baselineRow = diff.baselineById.get(row.id);
    if (!baselineRow || stable(currentRow) !== stable(baselineRow)) {
      throw new TrialCommitConflictError(
        `The ${table} row ${row.id} changed while this step was waiting for review. Discard and retry it.`,
      );
    }
  }

  for (const row of diff.inserts) {
    const currentRow = currentById.get(row.id);
    if (!currentRow) continue;
    if (stable(currentRow) === stable(row)) {
      alreadyApplied.add(row.id);
      continue;
    }
    throw new TrialCommitConflictError(
      `The ${table} row ${row.id} was added by another process while this step was waiting for review. Discard and retry it.`,
    );
  }

  for (const row of diff.updates) {
    const currentRow = currentById.get(row.id);
    if (!currentRow) {
      throw new TrialCommitConflictError(
        `The ${table} row ${row.id} was removed while this step was waiting for review. Discard and retry it.`,
      );
    }
    if (stable(currentRow) === stable(row)) {
      alreadyApplied.add(row.id);
      continue;
    }
    const baselineRow = diff.baselineById.get(row.id);
    if (!baselineRow || stable(currentRow) !== stable(baselineRow)) {
      throw new TrialCommitConflictError(
        `The ${table} row ${row.id} changed while this step was waiting for review. Discard and retry it.`,
      );
    }
  }

  const keep = (row: T) => !alreadyApplied.has(row.id);
  return {
    inserts: diff.inserts.filter(keep),
    updates: diff.updates.filter(keep),
    deletes: diff.deletes.filter(keep),
  };
}

function shallowFirst(a: FileEntryRow, b: FileEntryRow): number {
  return (
    a.relativePath.length - b.relativePath.length || a.id - b.id
  );
}

async function commitTodos(databases: TrialDatabases): Promise<void> {
  const [trialRows, baselineRows] = await Promise.all([
    databases.trial.select().from(todos),
    databases.baseline.select().from(todos),
  ]);
  const diff = diffRows(trialRows, baselineRows);
  if (
    diff.inserts.length === 0 &&
    diff.updates.length === 0 &&
    diff.deletes.length === 0
  ) {
    return;
  }

  await databases.public.transaction(async (tx) => {
    const currentRows = await tx.select().from(todos);
    const applied = planDiff(currentRows, diff, "todos");

    for (const row of applied.deletes) {
      await tx.delete(todos).where(eq(todos.id, row.id));
    }
    if (applied.inserts.length > 0) {
      await tx.insert(todos).overridingSystemValue().values(applied.inserts);
    }
    for (const row of applied.updates) {
      const { id, ...values } = row;
      await tx.update(todos).set(values).where(eq(todos.id, id));
    }

    await advanceIdentitySequence(tx, "todos");
  });
}

async function commitFileEntries(databases: TrialDatabases): Promise<void> {
  const [trialRows, baselineRows] = await Promise.all([
    databases.trial.select().from(fileEntries),
    databases.baseline.select().from(fileEntries),
  ]);
  const diff = diffRows(trialRows, baselineRows);
  if (
    diff.inserts.length === 0 &&
    diff.updates.length === 0 &&
    diff.deletes.length === 0
  ) {
    return;
  }

  const inserts = [...diff.inserts].sort(shallowFirst);
  const updates = [...diff.updates].sort(shallowFirst);
  const deletes = [...diff.deletes].sort((a, b) => shallowFirst(b, a));

  await databases.public.transaction(async (tx) => {
    const currentRows = await tx.select().from(fileEntries);
    const applied = planDiff(
      currentRows,
      { ...diff, inserts, updates, deletes },
      "fileEntries",
    );

    // Children go first on delete, parents first on insert; otherwise the
    // self-reference or the live-path unique index can transiently conflict.
    for (const row of applied.deletes) {
      await tx.delete(fileEntries).where(eq(fileEntries.id, row.id));
    }
    if (applied.inserts.length > 0) {
      await tx
        .insert(fileEntries)
        .overridingSystemValue()
        .values(applied.inserts);
    }
    for (const row of applied.updates) {
      const { id, ...values } = row;
      await tx
        .update(fileEntries)
        .set(values)
        .where(eq(fileEntries.id, id));
    }

    await advanceIdentitySequence(tx, "fileEntries");
  });
}

/**
 * Replays the trial's row changes into production. Each table uses one
 * transaction and only touches rows the attempt actually changed.
 */
export async function commitDatabase(
  databases: TrialDatabases,
): Promise<void> {
  try {
    await commitTodos(databases);
    await commitFileEntries(databases);
  } catch (err) {
    if (err instanceof TrialCommitConflictError) throw err;
    throw new TrialCommitConflictError(
      `Could not commit the reviewed changes: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
