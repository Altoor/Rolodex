import { AsyncLocalStorage } from "node:async_hooks";
import { getTableName } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { relations } from "./relations";

/**
 * A database handle with the workspace schema attached. Trial workspaces
 * create one of these against a throw-away Postgres schema so tool side
 * effects never reach production before an assisted step is accepted.
 */
export type AppDatabase = NodePgDatabase<typeof relations>;

const production: AppDatabase = drizzle(process.env.DATABASE_URL!, {
  relations,
});

interface DatabaseScope {
  database: AppDatabase;
  /** Present for trial scopes: only these tables may be mutated. */
  writableTables?: ReadonlySet<string>;
}

const scope = new AsyncLocalStorage<DatabaseScope>();

const MUTATIONS = new Set(["insert", "update", "delete"]);

function tableNameOf(table: unknown): string {
  try {
    return getTableName(table as never);
  } catch {
    return "";
  }
}

/**
 * Fails closed when a table is not explicitly writable. Exported so the
 * allowlist itself can be unit-tested without opening a trial database.
 */
export function assertTableWritable(
  name: string,
  writableTables: ReadonlySet<string>,
): void {
  if (!writableTables.has(name)) {
    throw new Error(
      `Trial workspace cannot write to table "${name || "unknown"}"; add it to TRIAL_TABLES and the commit logic first.`,
    );
  }
}

function assertWritable(
  table: unknown,
  writableTables: ReadonlySet<string>,
): void {
  assertTableWritable(tableNameOf(table), writableTables);
}

/**
 * Wraps a transaction handle so its writes obey the same allowlist as the
 * scoped database. Without this a tool could call `db.transaction` and write
 * a non-trial table straight to production.
 */
function guardTransaction(
  tx: object,
  writableTables: ReadonlySet<string>,
): object {
  return new Proxy(tx, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof property === "string" && MUTATIONS.has(property)) {
        return (table: unknown) => {
          assertWritable(table, writableTables);
          return (value as (table: unknown) => unknown).call(target, table);
        };
      }

      if (property === "transaction") {
        return (fn: (inner: object) => unknown) =>
          (value as (fn: (inner: object) => unknown) => unknown).call(
            target,
            (inner: object) => fn(guardTransaction(inner, writableTables)),
          );
      }

      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * The shared database handle. Every existing `@repo/db` caller keeps using
 * this value. Inside `runInDatabaseScope` the proxy routes each operation to
 * the scoped database instead, which is how trial tool runs are isolated.
 */
export const db: AppDatabase = new Proxy(production, {
  get(target, property, receiver) {
    const store = scope.getStore();
    const scoped = store?.database;
    if (!scoped) return Reflect.get(target, property, receiver);

    const writableTables = store?.writableTables;
    const value = Reflect.get(scoped, property, scoped);

    if (writableTables && typeof property === "string") {
      if (MUTATIONS.has(property)) {
        return (table: unknown) => {
          assertWritable(table, writableTables);
          return (value as (table: unknown) => unknown).call(scoped, table);
        };
      }

      if (property === "transaction") {
        return (fn: (inner: object) => unknown) =>
          (value as (fn: (inner: object) => unknown) => unknown).call(
            scoped,
            (inner: object) => fn(guardTransaction(inner, writableTables)),
          );
      }
    }

    return typeof value === "function" ? value.bind(scoped) : value;
  },
}) as AppDatabase;

/** Runs `fn` with every `@repo/db` call routed to `database`. */
export function runInDatabaseScope<T>(
  database: AppDatabase,
  fn: () => Promise<T>,
  options: { writableTables?: Iterable<string> } = {},
): Promise<T> {
  return scope.run(
    {
      database,
      writableTables:
        options.writableTables != null
          ? new Set(options.writableTables)
          : undefined,
    },
    fn,
  );
}

/** True while a trial database is active for the current async context. */
export function isInDatabaseScope(): boolean {
  return scope.getStore() !== undefined;
}
