# @repo/db

Owns the Postgres schema, Drizzle relations and the shared database client.

## Boundaries

- Import `db`, tables and relations from `@repo/db`.
- Do **not** import `@repo/tools` from this package. Tool state is intentionally
  typed as `unknown[]` here to avoid a package cycle.
- `apps/backend/src/db/index.ts` is a compatibility shim; new code should import
  this package directly.

## Adding a table

1. Add the table to `src/schema.ts`.
2. Add its relations in `src/relations/relations.ts`.
3. Run the backend Drizzle migrations (`drizzle.config.ts` points at this
   package).
