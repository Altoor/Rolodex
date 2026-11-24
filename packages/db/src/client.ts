import { AsyncLocalStorage } from "node:async_hooks";
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
}

const scope = new AsyncLocalStorage<DatabaseScope>();

/**
 * The shared database handle. Every existing `@repo/db` caller keeps using
 * this value. Inside `runInDatabaseScope` the proxy routes each operation to
 * the scoped database instead, which is how trial tool runs are isolated.
 */
export const db: AppDatabase = new Proxy(production, {
  get(target, property, receiver) {
    const scoped = scope.getStore()?.database;
    if (!scoped) return Reflect.get(target, property, receiver);

    const value = Reflect.get(scoped, property, scoped);
    return typeof value === "function" ? value.bind(scoped) : value;
  },
}) as AppDatabase;

/** Runs `fn` with every `@repo/db` call routed to `database`. */
export function runInDatabaseScope<T>(
  database: AppDatabase,
  fn: () => Promise<T>,
): Promise<T> {
  return scope.run({ database }, fn);
}

/** True while a trial database is active for the current async context. */
export function isInDatabaseScope(): boolean {
  return scope.getStore() !== undefined;
}
