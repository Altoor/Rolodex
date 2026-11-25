import type { Pool } from "pg";
import type { AppDatabase } from "@repo/db";

/** Options the host application supplies; the package never reads app config. */
export interface TrialWorkspaceOptions {
  databaseUrl: string;
  filesRoot: string;
}

/** One isolated attempt: a Postgres schema pair plus a copied files tree. */
export interface TrialWorkspace {
  runId: string;
  attemptId: number;
  /** Schema the tool writes to (`search_path=<schema>,public`). */
  schema: string;
  /** Immutable copy of production used to compute the commit diff. */
  baselineSchema: string;
  filesRoot: string;
  workspaceKey: string;
  database: AppDatabase;
  pool: Pool;
}

export class TrialCommitConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrialCommitConflictError";
  }
}
