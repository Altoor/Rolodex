import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  relations,
  runInDatabaseScope,
  type AppDatabase,
} from "@repo/db";
import { runWithFilesRoot } from "@repo/tools/tools/file/services/paths";
import { commitDatabase } from "./commit-database";
import {
  commitFiles,
  removeFileManifest,
  writeFileManifest,
} from "./commit-files";
import {
  baselineSchemaName,
  createTrialSchemas,
  dropTrialSchemas,
  listTrialSchemas,
  trialSchemaName,
  workspaceKeyFor,
} from "./schema";
import {
  TrialCommitConflictError,
  type TrialWorkspace,
  type TrialWorkspaceOptions,
} from "./types";

export { TrialCommitConflictError };
export type { TrialWorkspace, TrialWorkspaceOptions };

function scopedDatabase(
  databaseUrl: string,
  schema: string,
): { pool: Pool; database: AppDatabase } {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    options: `-c search_path=${schema},public`,
  });
  return {
    pool,
    database: drizzle({ client: pool, relations }) as AppDatabase,
  };
}

async function copyFilesToTrial(
  productionRoot: string,
  trialRoot: string,
): Promise<void> {
  await fs.rm(trialRoot, { recursive: true, force: true });
  await fs.mkdir(trialRoot, { recursive: true });

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(productionRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === ".trials" || entry.name === ".tmp") continue;
    await fs.cp(
      path.join(productionRoot, entry.name),
      path.join(trialRoot, entry.name),
      { recursive: true },
    );
  }
}

export interface TrialWorkspaceManager {
  begin(runId: string, attemptId: number): Promise<TrialWorkspace>;
  resume(runId: string, attemptId: number): Promise<TrialWorkspace>;
  runInTrial<T>(workspace: TrialWorkspace, fn: () => Promise<T>): Promise<T>;
  commit(workspace: TrialWorkspace): Promise<void>;
  discard(workspace: TrialWorkspace): Promise<void>;
  cleanupOrphans(liveWorkspaceKeys: Set<string>): Promise<void>;
  schemaName(runId: string, attemptId: number): string;
  workspaceKey(runId: string, attemptId: number): string;
}

/**
 * Creates the trial-workspace API for one host application.
 *
 * The package deliberately takes its roots and connection string as options so
 * it stays independent of app config and testable in isolation.
 */
export function createTrialWorkspaceManager(
  options: TrialWorkspaceOptions,
): TrialWorkspaceManager {
  if (!options.databaseUrl) {
    throw new Error("Trial workspace needs a database URL");
  }

  const adminPool = () =>
    new Pool({ connectionString: options.databaseUrl, max: 1 });

  async function begin(
    runId: string,
    attemptId: number,
  ): Promise<TrialWorkspace> {
    const schema = trialSchemaName(runId, attemptId);
    const baselineSchema = baselineSchemaName(schema);
    const filesRoot = path.join(
      options.filesRoot,
      ".trials",
      runId,
      String(attemptId),
    );

    const admin = adminPool();
    try {
      await createTrialSchemas(admin, schema, baselineSchema);
    } catch (err) {
      await dropTrialSchemas(admin, schema, baselineSchema).catch(
        () => undefined,
      );
      throw err;
    } finally {
      await admin.end();
    }

    try {
      await copyFilesToTrial(options.filesRoot, filesRoot);
      await writeFileManifest(filesRoot, options.filesRoot);
    } catch (err) {
      const cleanup = adminPool();
      try {
        await dropTrialSchemas(cleanup, schema, baselineSchema);
      } finally {
        await cleanup.end().catch(() => undefined);
      }
      await fs.rm(filesRoot, { recursive: true, force: true });
      throw err;
    }

    const scoped = scopedDatabase(options.databaseUrl, schema);
    return {
      runId,
      attemptId,
      schema,
      baselineSchema,
      filesRoot,
      workspaceKey: workspaceKeyFor(runId, attemptId),
      database: scoped.database,
      pool: scoped.pool,
    };
  }

  async function resume(
    runId: string,
    attemptId: number,
  ): Promise<TrialWorkspace> {
    const schema = trialSchemaName(runId, attemptId);
    const scoped = scopedDatabase(options.databaseUrl, schema);
    return {
      runId,
      attemptId,
      schema,
      baselineSchema: baselineSchemaName(schema),
      filesRoot: path.join(
        options.filesRoot,
        ".trials",
        runId,
        String(attemptId),
      ),
      workspaceKey: workspaceKeyFor(runId, attemptId),
      database: scoped.database,
      pool: scoped.pool,
    };
  }

  function runInTrial<T>(
    workspace: TrialWorkspace,
    fn: () => Promise<T>,
  ): Promise<T> {
    return runInDatabaseScope(workspace.database, () =>
      runWithFilesRoot(workspace.filesRoot, fn),
    );
  }

  async function commit(workspace: TrialWorkspace): Promise<void> {
    const baseline = scopedDatabase(
      options.databaseUrl,
      workspace.baselineSchema,
    );
    const production = scopedDatabase(options.databaseUrl, "public");

    try {
      await commitDatabase({
        trial: workspace.database,
        baseline: baseline.database,
        public: production.database,
      });
      await commitFiles(workspace.filesRoot, options.filesRoot);
    } finally {
      await baseline.pool.end().catch(() => undefined);
      await production.pool.end().catch(() => undefined);
    }

    await discard(workspace);
  }

  async function discard(workspace: TrialWorkspace): Promise<void> {
    await workspace.pool.end().catch(() => undefined);
    await fs.rm(workspace.filesRoot, { recursive: true, force: true });
    await removeFileManifest(workspace.filesRoot).catch(() => undefined);

    const admin = adminPool();
    try {
      await dropTrialSchemas(
        admin,
        workspace.schema,
        workspace.baselineSchema,
      );
    } finally {
      await admin.end();
    }
  }

  async function cleanupOrphans(
    liveWorkspaceKeys: Set<string>,
  ): Promise<void> {
    const trialsRoot = path.join(options.filesRoot, ".trials");
    const liveSchemas = new Set<string>();
    for (const key of liveWorkspaceKeys) {
      const match = key.match(/^\.trials\/([^/]+)\/(\d+)$/);
      if (!match) continue;
      const [, runId, attemptId] = match;
      if (!runId || !attemptId) continue;
      const schema = trialSchemaName(runId, Number(attemptId));
      liveSchemas.add(schema);
      liveSchemas.add(baselineSchemaName(schema));
    }

    let runs: string[];
    try {
      runs = await fs.readdir(trialsRoot);
    } catch {
      runs = [];
    }

    const staleRoots: string[] = [];
    for (const runId of runs) {
      const runRoot = path.join(trialsRoot, runId);
      const attempts = await fs.readdir(runRoot).catch(() => [] as string[]);
      for (const attemptId of attempts) {
        const key = workspaceKeyFor(runId, Number(attemptId));
        if (liveWorkspaceKeys.has(key)) continue;

        const target = path.join(runRoot, attemptId);
        const stat = await fs.stat(target).catch(() => undefined);
        // Leave very recent directories alone in case an attempt is starting.
        if (stat && Date.now() - stat.mtimeMs < 60 * 60 * 1000) continue;
        staleRoots.push(target);
      }
    }

    for (const target of staleRoots) {
      await fs.rm(target, { recursive: true, force: true });
      await removeFileManifest(target).catch(() => undefined);
    }

    const admin = adminPool();
    try {
      for (const schema of await listTrialSchemas(admin)) {
        if (liveSchemas.has(schema)) continue;
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally {
      await admin.end();
    }
  }

  return {
    begin,
    resume,
    runInTrial,
    commit,
    discard,
    cleanupOrphans,
    schemaName: trialSchemaName,
    workspaceKey: workspaceKeyFor,
  };
}
