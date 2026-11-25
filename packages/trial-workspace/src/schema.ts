import type { Pool } from "pg";

/**
 * Tables a trial clones and may write. Both only hold workspace data; adding
 * a table here means the trial/commit logic covers it too.
 */
export const TRIAL_TABLES = ["todos", "fileEntries"] as const;
export type TrialTable = (typeof TRIAL_TABLES)[number];

export function trialSchemaName(runId: string, attemptId: number): string {
  return `trial_${runId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}_${attemptId}`;
}

export function baselineSchemaName(schema: string): string {
  return `${schema}_baseline`;
}

export function workspaceKeyFor(runId: string, attemptId: number): string {
  return `.trials/${runId}/${attemptId}`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Creates the trial and baseline schemas.
 *
 * This is the only place that needs DDL. Row reads, diffs, and writes are
 * Drizzle queries against these schemas; see `commit-database.ts`.
 */
export async function createTrialSchemas(
  admin: Pool,
  schema: string,
  baseline: string,
): Promise<void> {
  await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdent(baseline)} CASCADE`);
  await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
  await admin.query(`CREATE SCHEMA ${quoteIdent(schema)}`);
  await admin.query(`CREATE SCHEMA ${quoteIdent(baseline)}`);

  for (const table of TRIAL_TABLES) {
    // Each attempt copies every row of the trial tables. That is O(workspace
    // size) per tool step; it is deliberate (full isolation, simple diffing)
    // and is documented as the accepted cost of trials.
    // The trial copy keeps identity/defaults/indexes so tools behave normally.
    await admin.query(
      `CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)}
       (LIKE public.${quoteIdent(table)} INCLUDING ALL)`,
    );
    await admin.query(
      `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)}
       OVERRIDING SYSTEM VALUE SELECT * FROM public.${quoteIdent(table)}`,
    );
    // Seeded ids do not advance the identity sequence.
    await admin.query(
      `SELECT setval(
         pg_get_serial_sequence('${quoteIdent(schema)}.${quoteIdent(table)}', 'id'),
         GREATEST(COALESCE((SELECT MAX(id) FROM ${quoteIdent(schema)}.${quoteIdent(table)}), 0), 1),
         (SELECT COUNT(*) > 0 FROM ${quoteIdent(schema)}.${quoteIdent(table)})
       )`,
    );

    // The baseline is read-only, so a plain table copy is enough.
    await admin.query(
      `CREATE TABLE ${quoteIdent(baseline)}.${quoteIdent(table)}
       AS SELECT * FROM public.${quoteIdent(table)}`,
    );
  }
}

export async function dropTrialSchemas(
  admin: Pool,
  schema: string,
  baseline: string,
): Promise<void> {
  await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdent(baseline)} CASCADE`);
  await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
}

/** Ambient trial/baseline schemas currently referenced by open attempts. */
export async function listTrialSchemas(admin: Pool): Promise<string[]> {
  const { rows } = await admin.query<{ schema_name: string }>(
    `SELECT schema_name
       FROM information_schema.schemata
      WHERE schema_name LIKE 'trial\\_%'`,
  );
  return rows.map((row) => row.schema_name);
}
