# Rolodex Implementation Plan

This plan turns the requested changes into concrete, ordered implementation work.
It is written so another agent can execute it without re-discovering the codebase.

The work is split into two tracks:

1. **Functional changes (Phases 1-5):** user-specific settings, user page, auth-aware navigation, and applying defaults to the task queue.
2. **UI rework (Phase 6):** a structured cleanup of `packages/ui`.

Phases 1-5 should be completed and green before starting the larger UI refactor. Phase 6 is intentionally split into independent sub-phases so it can be applied incrementally without breaking the working app.

---

## 0. Implementation Status

Last updated: 2026-11-05

| Area | Status | Notes |
| --- | --- | --- |
| Phase 0: baseline/environment | Done | Postgres/Ollama running; backend restarted on port 4000. |
| Phase 1: backend user settings | Done | `userSettings` table + migration, relations, service, Pothos type, mutation, `me.settings`, auth null-handling, per-user queue model, `createQueuedTask` default task. |
| Phase 2: GraphQL client/codegen | Done | `ME`, `UPDATE_USER_SETTINGS`, `INSTALLED_MODELS`, optional queued-task id; codegen and `@repo/queries` build pass. |
| Phase 3: auth navigation/user page | Done | `AuthProvider`, `useAuth`, auth-aware header, `/user` page, route guards, login/signup integration. |
| Phase 4: defaults applied | Done | Landing page preselects `defaultTaskId`; the task-queue "First task" selector reads and saves it; API fallback verified; queue model lookup added. |
| Phase 5: functional verification | Done | `pnpm lint`, `pnpm check-types`, and `pnpm build` pass. Backend GraphQL smoke tests pass. Backend still has no local `typescript` dependency, so it has no standalone `check-types` script. |
| Phase 6: `packages/ui` rework | Done | Shared layout/feedback/auth primitives, active navigation, single-source-of-truth decision/task forms, `useFieldArray` option/result editing, confirm-delete UX, responsive page polish, model-card state fixes, and removal of render-time Apollo side effects are complete. `useDebouncedFormState` and `lib/debounce` were deleted. Optional file-level extraction of the landing timeline and model-card container remains. |

### Implemented files (high level)

- `apps/backend/drizzle/20261105124205_flashy_joystick/migration.sql`
- `apps/backend/src/db/schema.ts`
- `apps/backend/src/db/relations/relations.ts`
- `apps/backend/src/schema/auth.ts`
- `apps/backend/src/schema/user/user-settings*.ts`
- `apps/backend/src/schema/user/user.ts`
- `apps/backend/src/schema/user/user-queries.ts`
- `apps/backend/src/schema/user/user-service.ts`
- `apps/backend/src/schema/user/index.ts`
- `apps/backend/src/schema/builder.ts`
- `apps/backend/src/queue/processor.ts`
- `apps/backend/src/schema/task/task-mutations.ts`
- `apps/backend/src/schema/ai/ai-mutations.ts`
- `apps/backend/src/schema/todo/todo-queries.ts`
- `apps/backend/src/schema/todo/todo-mutations.ts`
- `apps/backend/server.ts`
- `packages/queries/src/user/*`
- `packages/queries/src/model/model-queries.ts`
- `packages/queries/src/tasks/task-mutations.ts`
- `packages/ui/src/components/auth/auth-provider.tsx`
- `packages/ui/src/components/auth/auth-gate.tsx`
- `packages/ui/src/components/auth/auth-layout.tsx`
- `packages/ui/src/components/headerMenu/headerMenu.tsx`
- `packages/ui/src/components/layout/*`
- `packages/ui/src/components/feedback/*` (including `confirm-button.tsx`)
- `packages/ui/src/components/user/*`
- `packages/ui/src/components/decision/decision-form.ts`
- `packages/ui/src/components/decision/decision-answer.ts`
- `packages/ui/src/components/task/task-form.ts`
- `packages/ui/src/pages/user.tsx`
- `packages/ui/src/pages/landing.tsx`
- `packages/ui/src/pages/login.tsx`
- `packages/ui/src/pages/signUp.tsx`
- `packages/ui/src/pages/decisions.tsx`
- `packages/ui/src/pages/taskQueue.tsx`
- `packages/ui/src/pages/models.tsx`
- `packages/ui/src/components/auth/loginForm.tsx`
- `packages/ui/src/components/auth/signUpForm.tsx`
- `apps/web/app/App.tsx`
- `apps/web/app/user/page.tsx`
- `apps/web/app/GraphQlProvider.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/layout.tsx`
- `apps/web/eslint.config.js`
- `apps/web/next.config.ts`

### Verified commands

```sh
pnpm --filter backend generate
pnpm --filter backend push
pnpm --filter @repo/queries codegen
pnpm --filter @repo/queries build
pnpm --filter @repo/ui check-types
pnpm --filter @repo/ui build:components
pnpm --filter @repo/ui build:styles
pnpm --filter web check-types
pnpm --filter web build
pnpm lint
pnpm check-types
pnpm build
```

### Remaining work

1. Optional internal cleanup: extract the landing page into `StartRunForm`/`RunTimeline` and split `ModelCard` into presentational + container components. Behavior is implemented; this is file organization only.
2. Optional: add a backend `check-types` script and local `typescript` dependency so backend type-checking can run in CI (the backend currently relies on `tsx` at runtime and has no `tsc` script).
3. Optional hardening: remove `hashedPassword` from JWT payloads.
4. Manual visual smoke test at narrow mobile and wide desktop widths (HTTP smoke checks for navigation/routes passed, but no browser automation was run).

---

## 1. Scope and Assumptions

### 1.1 What "changes/settings" means in this plan

The settings are per-user preferences, persisted in PostgreSQL, with these initial fields:

| Setting | Meaning | Used by |
| --- | --- | --- |
| `defaultTaskId` | The task preselected as the starting task when a user queues a run. | Landing page, `createQueuedTask` fallback |
| `defaultModelName` | The Ollama model used to execute that user's queued tasks. | Queue processor |

The table is designed as one row per user, so it is unique per user by construction. Further settings can be added as new nullable columns without changing the ownership model.

### 1.2 Interpretation of "first task in the task queue"

The current app queues a run from the landing page using a "Starting task" selector. There is no separate queue-order editor. This plan implements the setting as:

- The default starting task shown on the landing page.
- The task used when `createQueuedTask` is called without an explicit `taskId`.

If the intended meaning is literal queue ordering (for example, a separate ordered list of tasks that should be queued automatically), that is a larger feature. The data model below can be extended with a `userQueueItems` join table later; it is called out in Section 13.

### 1.3 Interpretation of "models" (plural)

The current executor runs one model per request, hardcoded as `tev1:4b` in `apps/backend/src/queue/processor.ts`. This plan stores a single default model per user (`defaultModelName`) and applies it to every step in that user's run.

If multiple models per user are required, replace `defaultModelName` with a `userSettingsModels` join table or a `text[]` column and select a model per run. Do not block on this unless the product requirement is explicitly multiple models.

### 1.4 Logged-in detection

A user is considered logged in **only** if the GraphQL `me` query returns a non-null user.

This requires fixing the current backend behavior, which returns an empty object (`{}`) instead of `null` when authentication is absent or invalid. See Phase 1.5.

### 1.5 UI rework definition

"Reworking `packages/ui`" in this plan means:

- Consistent page/layout primitives.
- Auth-aware navigation and route guards.
- One source of truth for form state.
- Correct Apollo mutation/refetch behavior (no side effects during render).
- Consistent loading, empty, error, and destructive-action states.
- Better responsive layout, accessibility, and visual polish.
- No wholesale rewrite of generated shadcn/Base UI primitives.

---

## 2. Current-State Notes (Useful for the Implementer)

These are the specific problems this plan addresses:

- `apps/backend/src/queue/processor.ts` line 15: model is hardcoded:
  ```ts
  const MODEL = "tev1:4b";
  ```
- `apps/backend/server.ts` lines 34-49: `extract_user` returns `{}` for missing/invalid auth. That makes `ctx.user` truthy and breaks auth checks.
- `apps/backend/src/schema/user/user-queries.ts`: `me` returns `ctx.user` directly, so it must return `null` when there is no user.
- `apps/backend/src/schema/task/task-mutations.ts`: `createQueuedTask` requires a `taskId`; there is no fallback to a saved default.
- `packages/ui/src/components/headerMenu/headerMenu.tsx` lines 19-22: logout is a button in the menu.
- `packages/ui/src/pages/landing.tsx` lines 90-97: starting task defaults to `tasks[0]`, not a user setting.
- `packages/ui/src/hooks/useDebouncedFormState.ts`: duplicated parent/child form state, debounced mirrors, and ref-based sync loops.
- `packages/ui/src/components/task/taskResultOption/taskResultOption.tsx` line 98: `client.refetchQueries(...)` is called during render.
- `packages/ui/src/components/models/modelCard.tsx` line 60: `setValue(...)` is called during render.
- `packages/ui/src/components/task/taskFlow/taskFlow.tsx` line 17: CSS for `@xyflow/react` is imported inside a component.
- `apps/web/next.config.ts`: `typescript.ignoreBuildErrors` is enabled.

---

## 3. Target Design

### 3.1 Database

Add a `userSettings` table at the bottom of `apps/backend/src/db/schema.ts` (after `users`, `tasks`, and `models` are declared, so the foreign-key callbacks can reference them safely):

```ts
export const userSettings = pgTable("userSettings", {
  userId: integer("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultTaskId: integer("defaultTaskId").references(() => tasks.id, {
    onDelete: "set null",
  }),
  defaultModelName: text("defaultModelName").references(() => models.name, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

Notes:

- `userId` is the primary key: exactly one settings row per user.
- `onDelete: "cascade"` removes settings when a user is deleted.
- `onDelete: "set null"` clears defaults when a task/model is deleted.
- `models.name` is already a unique primary key, so it is a valid FK target.

### 3.2 Drizzle relations

In `apps/backend/src/db/relations/relations.ts`:

- Add `settings` to `users`:
  ```ts
  users: {
    todos: r.many.todos(),
    todos_todo: r.many.todos(),
    settings: r.one.userSettings({
      from: r.users.id,
      to: r.userSettings.userId,
    }),
  },
  ```
- Add a `userSettings` relation block:
  ```ts
  userSettings: {
    user: r.one.users({
      from: r.userSettings.userId,
      to: r.users.id,
    }),
    defaultTask: r.one.tasks({
      from: r.userSettings.defaultTaskId,
      to: r.tasks.id,
    }),
    defaultModel: r.one.models({
      from: r.userSettings.defaultModelName,
      to: r.models.name,
    }),
  },
  ```

### 3.3 GraphQL API

Add to `apps/backend/src/schema/user/`:

- `user-settings.ts`: `UserSettings` Pothos Drizzle object.
- `user-settings-service.ts`: `ensureUserSettings`, `getUserSettings`, `updateUserSettings`.
- `user-settings-queries.ts`: optional standalone query if needed.
- `user-settings-mutations.ts`: `updateUserSettings` mutation.
- Update `apps/backend/src/schema/user/index.ts` to export the new files.

GraphQL shape:

```graphql
type UserSettings {
  userId: Int!
  defaultTaskId: Int
  defaultModelName: String
  defaultTask: Task
  defaultModel: Model
  updatedAt: DateTime!
}

type User {
  id: Int!
  name: String!
  email: String!
  settings: UserSettings
}

type Query {
  me: User
}

type Mutation {
  updateUserSettings(
    defaultTaskId: Int
    defaultModelName: String
  ): UserSettings!
}
```

Semantics of `updateUserSettings`:

- An **omitted** argument keeps the current value.
- An explicit `null` clears the value.
- The user id is always taken from the auth context; never accept a `userId` argument.
- Validate that `defaultTaskId` exists.
- Validate that `defaultModelName` exists and is pulled/installed.

### 3.4 Queue behavior

For every queued task, look up the settings row of `queuedTasks.queued_by`:

```ts
const [settings] = await db
  .select({ defaultModelName: userSettings.defaultModelName })
  .from(userSettings)
  .where(eq(userSettings.userId, row.queued_by))
  .limit(1);

const model = settings?.defaultModelName ?? DEFAULT_MODEL;
```

Use `DEFAULT_MODEL` as a fallback for users with no settings row or no configured model. Store the model in the step result for traceability:

```ts
const result = {
  answer,
  usage: response.usage,
  model,
  branch,
  nextTaskId,
  summary,
  ...(note ? { note } : {}),
};
```

---

## 4. Phase 0: Baseline and Environment

> Status: DONE — environment started and baseline checks recorded.

- [ ] Confirm the working tree is clean or record existing local changes:
  ```sh
  git status --short
  ```
- [ ] Install dependencies:
  ```sh
  pnpm install
  ```
- [ ] Start Postgres and Ollama:
  ```sh
  docker compose up -d postgres ollama
  ```
- [ ] Start the backend in a separate terminal:
  ```sh
  pnpm --filter backend api
  ```
- [ ] Run the current checks once to capture the baseline:
  ```sh
  pnpm lint
  pnpm check-types
  ```
- [ ] If the baseline has unrelated failures, record them in the PR/notes before changing code.

Do not start by regenerating the GraphQL client code. The backend schema must be changed first, then codegen runs against the live API.

---

## 5. Phase 1: Backend User Settings

> Status: DONE — schema, migration, GraphQL settings API, auth fixes, queue model, and default task fallback are implemented and smoke-tested.

### 5.1 Add the database table

- [ ] Edit `apps/backend/src/db/schema.ts`.
- [ ] Add the `userSettings` table from Section 3.1 at the end of the file.
- [ ] Confirm the file imports everything needed (`integer`, `text`, `timestamp`, `pgTable` are already imported).

### 5.2 Add relations

- [ ] Edit `apps/backend/src/db/relations/relations.ts`.
- [ ] Add `users.settings` and the `userSettings` block from Section 3.2.
- [ ] Run a type check on the backend:
  ```sh
  pnpm --filter backend check-types
  ```
  If the backend has no `check-types` script, run `pnpm --filter backend exec tsc --noEmit`.

### 5.3 Add the settings service

Create `apps/backend/src/schema/user/user-settings-service.ts`.

Required functions:

```ts
import { eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { db } from "../builder";
import { models, tasks, userSettings } from "../../db";

export const ensureUserSettings = async (userId: number) => {
  const existing = await db.query.userSettings.findFirst({
    where: { userId },
  });
  if (existing) return existing;

  const [created] = await db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const settings = await db.query.userSettings.findFirst({
    where: { userId },
  });

  if (!settings) {
    throw new GraphQLError("Could not create user settings", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  return settings;
};

export const getUserSettings = async (userId: number) => {
  return ensureUserSettings(userId);
};

type UpdateSettingsInput = {
  defaultTaskId?: number | null;
  defaultModelName?: string | null;
};

export const updateUserSettings = async (
  userId: number,
  input: UpdateSettingsInput,
) => {
  await ensureUserSettings(userId);

  if (input.defaultTaskId !== undefined && input.defaultTaskId !== null) {
    const task = await db.query.tasks.findFirst({
      where: { id: input.defaultTaskId },
    });
    if (!task) {
      throw new GraphQLError("Task not found", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }

  if (input.defaultModelName !== undefined && input.defaultModelName !== null) {
    const model = await db.query.models.findFirst({
      where: { name: input.defaultModelName },
    });
    if (!model) {
      throw new GraphQLError("Model not found", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    if (!model.pulled) {
      throw new GraphQLError("Model is not installed", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }

  const [updated] = await db
    .update(userSettings)
    .set({
      ...(input.defaultTaskId !== undefined
        ? { defaultTaskId: input.defaultTaskId }
        : {}),
      ...(input.defaultModelName !== undefined
        ? { defaultModelName: input.defaultModelName }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId))
    .returning();

  return updated;
};
```

Notes:

- `ensureUserSettings` is the lazy backfill path for users created before this migration.
- Also call `ensureUserSettings` during `createUser` in `apps/backend/src/schema/user/user-service.ts` so new users get a row immediately:
  ```ts
  await db.insert(userSettings).values({ userId: user[0].id }).onConflictDoNothing();
  ```
- Keep the service independent of `ctx`; the resolver decides which user is acting.

### 5.4 Add the Pothos object

Create `apps/backend/src/schema/user/user-settings.ts`:

```ts
import { builder } from "../builder";

export const UserSettings = builder.drizzleObject("userSettings", {
  name: "UserSettings",
  fields: (t) => ({
    userId: t.exposeInt("userId"),
    defaultTaskId: t.exposeInt("defaultTaskId", { nullable: true }),
    defaultModelName: t.exposeString("defaultModelName", { nullable: true }),
    defaultTask: t.relation("defaultTask", { nullable: true }),
    defaultModel: t.relation("defaultModel", { nullable: true }),
    updatedAt: t.field({
      type: "DateTime",
      resolve: (parent) => new Date(parent.updatedAt),
    }),
  }),
});
```

Then add the relation field to `User` in `apps/backend/src/schema/user/user.ts`:

```ts
settings: t.relation("settings", { nullable: true }),
```

### 5.5 Add the mutation

Create `apps/backend/src/schema/user/user-settings-mutations.ts`:

```ts
import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { UserSettings } from "./user-settings";
import { updateUserSettings as updateSettings } from "./user-settings-service";

builder.mutationType({
  fields: (t) => ({
    updateUserSettings: t.field({
      type: UserSettings,
      args: {
        defaultTaskId: t.arg.int(),
        defaultModelName: t.arg.string(),
      },
      resolve: async (_root, args, ctx) => {
        const user = (ctx as any).user;
        if (!user?.id) {
          throw new GraphQLError("Not logged in", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        return updateSettings(user.id, {
          defaultTaskId: args.defaultTaskId,
          defaultModelName: args.defaultModelName,
        });
      },
    }),
  }),
});
```

Important: GraphQL distinguishes omitted (`undefined`) from explicit `null` in resolver arguments. Preserve that distinction in the service, as shown.

### 5.6 Export the new modules

Update `apps/backend/src/schema/user/index.ts`:

```ts
export * from "./user";
export * from "./user-settings";
export * from "./user-queries";
export * from "./user-settings-queries"; // only if that file was added
export * from "./user-mutations";
export * from "./user-settings-mutations";
```

`apps/backend/src/schema/index.ts` already imports `./user/index`, so no change is needed there.

### 5.7 Fix `me` and auth context

Edit `apps/backend/src/schema/user/user-queries.ts`:

```ts
me: t.field({
  type: User,
  nullable: true,
  resolve: async (_root, _args, ctx) => {
    const user = (ctx as any).user;
    if (!user?.id) return null;
    await ensureUserSettings(user.id);
    return user;
  },
}),
```

Edit `apps/backend/server.ts`:

- Change `extract_user` to return `null` instead of `{}` for missing/invalid auth.
- Keep a typed return value:
  ```ts
  async function extractUser(
    authHeader: string | null,
  ): Promise<typeof users.$inferSelect | null> {
    if (!authHeader) return null;
    const token = authHeader.split(" ")[1];
    if (!token) return null;
    try {
      const verified = jwt.verify(token, process.env.TOKEN_SECRET);
      if (typeof verified === "string" || !verified.aud) return null;
      return await getUser(parseInt(verified.aud as string));
    } catch {
      return null;
    }
  }
  ```
- Rename the function to `extractUser` and update the context call.
- Add the needed type import from `./src/db` if necessary.

Also update `PothosTypes.Context` in `apps/backend/src/schema/builder.ts` so it reflects reality:

```ts
Context: { user: typeof schema.users.$inferSelect | null };
```

Remove the old `import { User } from "./user";` if it becomes unused. This is important because the current `Context: { user: typeof User }` is not the database row type.

#### Audit direct `ctx.user.id` access

Changing the context from `{}` to `null` means code like this now throws a `TypeError` before the existing "not logged in" check:

```ts
const author_id = (ctx as any).user.id; // fails when user is null
if (!author_id) { ... }
```

Add a shared helper, for example `apps/backend/src/schema/auth.ts`:

```ts
import { GraphQLError } from "graphql";

type AuthContext = { user?: { id?: number } | null };

export function requireUserId(ctx: AuthContext): number {
  const id = ctx.user?.id;
  if (!id) {
    throw new GraphQLError("Not logged in", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return id;
}
```

Then find every direct access:

```sh
grep -rn "(ctx as any)\.user\.id" apps/backend/src
```

Replace the affected resolvers with either:

- `const authorId = requireUserId(ctx);` (preferred), or
- `const authorId = (ctx as any).user?.id;` followed by the existing check.

This must cover at least:

- `apps/backend/src/schema/ai/ai-mutations.ts`
- `apps/backend/src/schema/todo/todo-mutations.ts`
- `apps/backend/src/schema/todo/todo-queries.ts`
- `apps/backend/src/schema/task/task-mutations.ts`

For resolvers that already do `const user = (ctx as any).user; if (!user) ...`, no change is needed after the context becomes `null`.

After this change, every existing `if (!user)` / `if (!(ctx as any).user)` check works correctly. Do not use truthiness of an empty object anymore.

### 5.8 Apply the user's model in the queue

Edit `apps/backend/src/queue/processor.ts`:

- Rename `MODEL` to `DEFAULT_MODEL` and keep the current value.
- Import `userSettings` from `../db`.
- Add a small helper:

  ```ts
  async function modelForUser(userId: number): Promise<string> {
    const [settings] = await db
      .select({ defaultModelName: userSettings.defaultModelName })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    return settings?.defaultModelName ?? DEFAULT_MODEL;
  }
  ```

- In `processStep`, before the `ollama.systemone` call:
  ```ts
  const model = await modelForUser(row.queued_by);
  response = await ollama.systemone({
    model,
    state: row.state,
    questions,
  });
  ```
- Add `model` to the result object from Section 3.4.

Do not use the settings service inside the queue processor if it creates an import cycle with `builder.ts`. A direct `db.select()` on `userSettings` is simpler and safe.

### 5.9 Make `createQueuedTask` use the default task

Edit `apps/backend/src/schema/task/task-mutations.ts`:

- Change the argument from required to optional:
  ```ts
  taskId: t.arg.int(),
  ```
- Resolve the task id as follows:
  ```ts
  const settings = await getUserSettings(author_id);
  const resolvedTaskId = taskId ?? settings.defaultTaskId;

  if (resolvedTaskId == null) {
    throw new GraphQLError(
      "No starting task selected and no default task configured",
      {
        extensions: { code: "BAD_USER_INPUT" },
      },
    );
  }
  ```
- Use `resolvedTaskId` when inserting the queued task.

Import `getUserSettings` from `../user/user-settings-service`.

### 5.10 Generate and apply the migration

From the repository root:

```sh
pnpm --filter backend generate
```

- Inspect the new SQL folder under `apps/backend/drizzle/`.
- Confirm it creates `"userSettings"` with the three FK constraints and `updatedAt`.
- Apply it:
  ```sh
  pnpm --filter backend push
  ```
  The project currently uses `drizzle-kit push`; there is no `drizzle-kit migrate` script.

Optional backfill for existing users:

```sql
INSERT INTO "userSettings" ("userId")
SELECT "id" FROM "users"
ON CONFLICT ("userId") DO NOTHING;
```

This is optional because `ensureUserSettings` lazily creates missing rows.

### 5.11 Backend smoke test

With the backend running, test with `curl` or the GraphQL playground:

1. Create/login a user and capture the token.
2. Query:
   ```graphql
   query {
     me {
       id
       name
       email
       settings {
         defaultTaskId
         defaultModelName
       }
     }
   }
   ```
   Expected: `me` is non-null and `settings` exists.
3. Query without an `Authorization` header.
   Expected: `data.me` is `null`, not an error caused by missing non-null fields.
4. Update settings:
   ```graphql
   mutation {
     updateUserSettings(
       defaultTaskId: 1
       defaultModelName: "tev1:4b"
     ) {
       defaultTaskId
       defaultModelName
     }
   }
   ```
5. Clear a setting with an explicit `null`:
   ```graphql
   mutation {
     updateUserSettings(defaultTaskId: null) {
       defaultTaskId
     }
   }
   ```
   Expected: the value is cleared.
6. Omit a setting:
   ```graphql
   mutation {
     updateUserSettings(defaultModelName: "tev1:4b") {
       defaultTaskId
       defaultModelName
     }
   }
   ```
   Expected: `defaultTaskId` keeps its previous value.

---

## 6. Phase 2: GraphQL Client Documents and Codegen

> Status: DONE — client documents updated, codegen run, and `@repo/queries` rebuilt.

All GraphQL documents live in `packages/queries`; generated files must not be edited by hand.

### 6.1 Update `ME`

Edit `packages/queries/src/user/users-queries.ts`:

```ts
export const ME = gql(/* GraphQL */ `
  query GetMe {
    me {
      email
      id
      name
      settings {
        defaultTaskId
        defaultModelName
      }
    }
  }
`);
```

### 6.2 Add the update mutation

Edit `packages/queries/src/user/user-mutations.ts`:

```ts
export const UPDATE_USER_SETTINGS = gql(/* GraphQL */ `
  mutation UpdateUserSettings(
    $defaultTaskId: Int
    $defaultModelName: String
  ) {
    updateUserSettings(
      defaultTaskId: $defaultTaskId
      defaultModelName: $defaultModelName
    ) {
      userId
      defaultTaskId
      defaultModelName
    }
  }
`);
```

### 6.3 Add an installed-models query

Edit `packages/queries/src/model/model-queries.ts`:

```ts
export const INSTALLED_MODELS = gql(/* GraphQL */ `
  query GetInstalledModels {
    installedModels {
      name
      description
      pulled
    }
  }
`);
```

`installedModels` already exists in `apps/backend/src/schema/llmModel/llmModel-queries.ts` and only returns installed models.

### 6.4 Make the queued-task task id optional

Edit `packages/queries/src/tasks/task-mutations.ts`:

```ts
export const CREATE_QUEUED_TASK = gql(/* GraphQL */ `
  mutation CreateQueuedTask($taskId: Int, $state: String!) {
    createQueuedTask(taskId: $taskId, state: $state) {
      id
      taskId
      state
      status
      runId
      queued_by
    }
  }
`);
```

### 6.5 Regenerate and rebuild

Start the backend first (codegen reads `http://localhost:4000/graphql`):

```sh
pnpm --filter backend api
```

In another terminal:

```sh
pnpm --filter @repo/queries codegen
pnpm --filter @repo/queries build
```

Validation:

- The generated file under `packages/queries/src/__generated__/` should contain the new mutation and updated `GetMe` type.
- `@repo/ui` imports generated types from `@repo/queries/__generated__/graphql`; rebuild before type-checking the UI.

Do not run codegen before the backend schema is live; it will generate the old schema.

---

## 7. Phase 3: Auth-Aware Navigation and User Page

> Status: DONE — `AuthProvider`, auth-aware navigation, user page, route guards, and login/signup integration are implemented.

### 7.1 Add a shared auth provider

Create `packages/ui/src/components/auth/auth-provider.tsx` (`"use client"`).

Responsibilities:

- Run the `ME` query once for the app.
- Expose `user`, `loading`, `setToken`, and `logout`.
- Keep the token in `localStorage` under the existing key `auth_token`.
- After login, reset the Apollo store so `ME` and all dependent queries refetch.
- After logout, clear the Apollo store and remove the token.

Suggested shape:

```tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { ME } from "@repo/queries/user/users-queries";

type AuthContextValue = {
  user: {
    id: number;
    name: string;
    email: string;
    settings: {
      defaultTaskId: number | null;
      defaultModelName: string | null;
    } | null;
  } | null;
  loading: boolean;
  setToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, client } = useQuery(ME, {
    fetchPolicy: "cache-and-network",
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data?.me ?? null,
      loading,
      setToken: async (token) => {
        localStorage.setItem("auth_token", token);
        await client.resetStore();
      },
      logout: async () => {
        localStorage.removeItem("auth_token");
        await client.clearStore();
        window.location.assign("/user");
      },
    }),
    [data?.me, loading, client],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
```

Notes:

- `useQuery(ME)` is safe to run when logged out because `me` now returns `null`.
- `client.resetStore()` refetches active queries after the token changes.
- `GraphQlProvider` already reads the token from `localStorage` on every request, so no link changes are required.

### 7.2 Wire the provider into the app

Edit `apps/web/app/App.tsx`:

```tsx
import HeaderMenu from "@repo/ui/components/headerMenu/headerMenu";
import { AuthProvider } from "@repo/ui/components/auth/auth-provider";
import GraphQlProvider from "./GraphQlProvider";

export default function App({ children }: { children: React.ReactNode }) {
  return (
    <GraphQlProvider>
      <AuthProvider>
        <HeaderMenu />
        <main className="mx-auto w-full max-w-6xl px-4 pb-12 md:px-6">
          {children}
        </main>
      </AuthProvider>
    </GraphQlProvider>
  );
}
```

### 7.3 Update login and signup forms

Edit `packages/ui/src/components/auth/loginForm.tsx` and `signUpForm.tsx`:

- Replace the `localStorage.setItem(...); window.location.reload();` block with the auth provider's `setToken`.
- Keep mutation loading/error handling.
- On success, `setToken(data.login)` / `setToken(data.createUser)`.
- Add `type="password"` and `autoComplete` attributes while touching these files.

Example:

```tsx
const { setToken } = useAuth();

const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
  const result = await login({ variables: inputs });
  if (result.data?.login) {
    await setToken(result.data.login);
  }
};
```

### 7.4 Rewrite the header menu

Edit `packages/ui/src/components/headerMenu/headerMenu.tsx`.

Requirements:

- Always show **Main** (`/`).
- Always show **User** (`/user`).
- When logged in, also show **Decisions**, **Task queue**, and **Models**.
- When logged out, hide those three links.
- Remove the Logout button entirely.
- While `ME` is loading, avoid flashing protected links. Show the spinner in the trailing item, but keep the nav stable.
- Use `data?.me` as the source of truth, not `data`.

Suggested structure:

```tsx
const { user, loading } = useAuth();

const navItems = [
  { href: "/", label: "Main", requiresAuth: false },
  { href: "/decisions", label: "Decisions", requiresAuth: true },
  { href: "/task-queue", label: "Task queue", requiresAuth: true },
  { href: "/models", label: "Models", requiresAuth: true },
  { href: "/user", label: "User", requiresAuth: false },
];

const visibleItems = navItems.filter(
  (item) => !item.requiresAuth || Boolean(user),
);

return (
  <div className="flex w-full p-6 md:p-10">
    <NavigationMenu className="w-full flex flex-row">
      <NavigationMenuList className="w-full">
        {visibleItems.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink href={item.href}>
              {item.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
      <NavigationMenuList>
        <NavigationMenuItem>
          {loading ? <Spinner /> : null}
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
);
```

Optional polish: show the user's name in the User link (`User · {user.name}`), but keep the label stable for accessibility.

### 7.5 Add the user page route

Create `apps/web/app/user/page.tsx`:

```tsx
import UserPage from "@repo/ui/pages/user";

export default function Page() {
  return <UserPage />;
}
```

### 7.6 Add the user page UI

Create `packages/ui/src/pages/user.tsx` (`"use client"`).

Behavior:

- Use `useAuth()`.
- If `loading`: show a loading state.
- If no `user`: render `<LoginForm />` plus a link to `/signUp`.
- If `user`:
  - Show profile details (`name`, `email`).
  - Show a settings form.
  - Show a Logout button that calls `logout()`.

Split the component into `UserPage` (decides logged-in vs logged-out) and `AuthenticatedUserPage` (owns the protected `TASKS` / `INSTALLED_MODELS` / settings queries). This avoids running logged-in-only queries while the login form is shown.

The settings form:

- Initialize from `user.settings` (the `ME` query already includes it through `AuthProvider`).
- Query `TASKS` and `INSTALLED_MODELS`.
- Use `react-hook-form` with either real values or sentinel `"__none__"` for null selects.
- Submit `UPDATE_USER_SETTINGS`:
  ```ts
  updateUserSettings({
    variables: {
      defaultTaskId: taskId === "__none__" ? null : Number(taskId),
      defaultModelName:
        modelName === "__none__" ? null : modelName,
    },
    refetchQueries: [ME],
  });
  ```
- Reset the form from `user.settings` after the refetch (or pass `values` to `useForm`) so the saved values are reflected.
- Show saving state, success feedback, and GraphQL errors inline.
- Disable the form when tasks/models are loading.
- If no tasks exist, explain that a task must be created first and link to `/task-queue`.
- If no models are installed, explain that a model must be installed first and link to `/models`.

Suggested page outline:

```tsx
<div className="flex flex-col gap-6">
  <PageHeader
    title="Account"
    description="Manage your profile and queue defaults"
  />

  <ProfileCard user={user} onLogout={logout} />

  <Card>
    <CardHeader>
      <CardTitle>Queue defaults</CardTitle>
      <CardDescription>
        These settings apply only to your account.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <UserSettingsForm />
    </CardContent>
  </Card>
</div>
```

`PageHeader`, `ProfileCard`, and `UserSettingsForm` can start as local components in `user.tsx` and move to `components/user/` during Phase 6. If `PageHeader`/`PageContainer` do not exist yet, create minimal versions now; Phase 6 formalizes them.

### 7.7 Add route guards

The navigation hides protected links, but direct URLs must also be protected.

Create `packages/ui/src/components/auth/auth-gate.tsx`:

```tsx
"use client";

import { useAuth } from "./auth-provider";
import { EmptyState } from "#components/feedback/empty-state";
import { LoadingState } from "#components/feedback/loading-state";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState />;
  if (!user) {
    return (
      <EmptyState
        title="Sign in required"
        description="Log in to use this page."
        actionHref="/user"
        actionLabel="Go to account"
      />
    );
  }

  return <>{children}</>;
}
```

If `EmptyState`/`LoadingState` do not exist yet, create simple versions now (Phase 6 formalizes them).

Wrap the page contents in:

- `packages/ui/src/pages/decisions.tsx`
- `packages/ui/src/pages/taskQueue.tsx`
- `packages/ui/src/pages/models.tsx`

Example:

```tsx
export default function ModelsPage() {
  return (
    <AuthGate>
      <ModelsPageContent />
    </AuthGate>
  );
}
```

Keep the existing page implementation in a local `...Content` component to avoid changing all the internals at once.

### 7.8 Update login/signup pages

`packages/ui/src/pages/login.tsx` and `signUp.tsx` currently check `data` instead of `data.me`. Update them to use `useAuth()`:

- If logged in, show a short "You are logged in" card with a link to `/user`.
- If logged out, show the form.
- Optionally redirect logged-in users to `/user` in Phase 6.

This also removes the `data ? ...` bug where an Apollo response object is truthy even when `me` is null.

### 7.9 Verify navigation behavior

- Logged out:
  - Header shows only **Main** and **User**.
  - `/decisions`, `/task-queue`, `/models` show the sign-in gate.
  - `/user` shows the login form.
  - `me` returns `null`.
- Logged in:
  - Header shows **Main**, **Decisions**, **Task queue**, **Models**, **User**.
  - No Logout button in the header.
  - `/user` shows profile, settings, and Logout.
  - Logout returns to `/user` and the header collapses back to Main + User.

---

## 8. Phase 4: Apply Defaults on the Landing Page and Queue

> Status: DONE — landing page uses `defaultTaskId`; `createQueuedTask` fallback and per-user queue model were verified. The `/task-queue` "First task" selector now initializes from and persists the user's default task.

### 8.1 Use the user's default starting task

Edit `packages/ui/src/pages/landing.tsx`.

Current behavior:

- `useForm` default is `tasks[0]?.id ?? "-1"`.
- An effect replaces `-1` with `tasks[0]` once tasks load.

New behavior:

- Read `me.settings.defaultTaskId` from the existing `ME` query (or use `useAuth()`).
- Only fetch tasks and subscribe to queued-task events when logged in:
  ```ts
  const { data: tasksData, loading: tasksLoading } = useQuery(TASKS, {
    skip: !loggedIn,
  });

  useSubscription(QUEUED_TASK_EVENT, {
    skip: !loggedIn,
    onData: ...,
  });
  ```
  After the backend `ctx.user` fix, logged-out `TASKS` would otherwise throw "Not logged in".
- When tasks are loaded, choose:
  1. The user's default task, if it still exists.
  2. Otherwise the first task.
- Keep `-1` only as the temporary "not initialized" sentinel.

Suggested effect:

```tsx
const defaultTaskId = meData?.me?.settings?.defaultTaskId ?? null;

useEffect(() => {
  if (tasksLoading || tasks.length === 0) return;
  if (getValues("taskId") !== "-1") return;

  const preferredTaskId =
    defaultTaskId != null && tasks.some((task) => task.id === defaultTaskId)
      ? defaultTaskId
      : tasks[0]?.id;

  if (preferredTaskId != null) {
    reset({ ...getValues(), taskId: String(preferredTaskId) });
  }
}, [tasksLoading, tasks, defaultTaskId, getValues, reset]);
```

Keep the selector so users can override the default for a single run.

### 8.2 Optionally use the API fallback

The UI always sends a task id, but the backend now supports omitting it. This makes `createQueuedTask` robust for future callers and for an eventual "start queue" button.

To exercise the fallback manually, call:

```graphql
mutation {
  createQueuedTask(state: "test") {
    id
    taskId
  }
}
```

Expected: it uses the authenticated user's `defaultTaskId`, or returns a clear error if none is configured.

### 8.3 Verify per-user model selection

1. Set user A's default model to a value available in Ollama.
2. Set user B's default model to a different value.
3. Queue a task as each user.
4. Inspect the completed `queuedTasks.result` JSON.
5. Confirm `result.model` matches each user's setting.

If a user has no setting, confirm the fallback `tev1:4b` is used.

---

## 9. Phase 5: Regenerate, Type-Check, and Smoke Test the Functional Work

> Status: MOSTLY DONE — codegen/build/type checks and web production build pass; lint retains pre-existing warnings.

- [ ] Re-run codegen if any GraphQL document changed after the last run:
  ```sh
  pnpm --filter @repo/queries codegen
  pnpm --filter @repo/queries build
  ```
- [ ] Build the UI package:
  ```sh
  pnpm --filter @repo/ui build:components && pnpm --filter @repo/ui build:styles
  ```
- [ ] Type-check:
  ```sh
  pnpm check-types
  ```
- [ ] Lint:
  ```sh
  pnpm lint
  ```
- [ ] Run the web app and complete the manual checks in Sections 5.11, 7.9, 8.3.

At this point, requirements 1-3 should be functionally complete even if the UI is not yet pretty.

---

## 10. Phase 6: `packages/ui` Rework

> Status: DONE — layout/feedback/auth primitives, active navigation, single-source-of-truth forms, confirm-delete UX, responsive polish, and model-card state fixes are implemented. `useDebouncedFormState` and `lib/debounce` were removed.

This phase improves the frontend without changing the backend contract. Apply it in small batches. After each sub-phase, run `pnpm --filter @repo/ui lint`, `pnpm --filter @repo/ui check-types`, and `pnpm --filter @repo/ui build:components && pnpm --filter @repo/ui build:styles`.

### 10.1 Design goals

- Every page shares one horizontal rhythm and max width.
- Every page handles loading, empty, error, and success states explicitly.
- Every form has one source of truth.
- Destructive actions require confirmation and are visually distinct.
- Icon-only buttons have accessible labels/titles.
- Layout is usable down to a narrow mobile viewport.
- Presentational components do not call Apollo unless they are explicitly containers. Prefer a `Foo` component that receives props and a `FooContainer` that owns queries.

### 10.2 Create layout and feedback primitives

Create:

- `packages/ui/src/components/layout/page-container.tsx`
  - `PageContainer`: `mx-auto w-full max-w-6xl px-4 py-6 md:px-6 lg:py-8`
  - `PageHeader`: title, description, optional actions.
- `packages/ui/src/components/layout/section.tsx`
  - Consistent section spacing/title if needed.
- `packages/ui/src/components/feedback/loading-state.tsx`
  - Centered spinner plus optional label.
- `packages/ui/src/components/feedback/empty-state.tsx`
  - Title, description, optional action link/button.
- `packages/ui/src/components/feedback/error-state.tsx`
  - Human-readable error plus retry action.
- `packages/ui/src/components/feedback/confirm-button.tsx`
  - `AlertDialog`/dropdown-based confirmation for delete actions.
- `packages/ui/src/components/feedback/toast.tsx` or integrate a small toast helper.
  - Use it for mutation success/error feedback instead of silently refetching.

Update `apps/web/app/App.tsx` to render pages inside the shared page container as shown in Section 7.2, or let each page use `PageContainer` explicitly. Do not do both with double padding.

### 10.3 Normalize app chrome and styles

- Edit `apps/web/app/globals.css`.
  - Remove the legacy RGB variables and body gradient (lines 4-26). They conflict with the shared theme tokens.
  - Keep only:
    ```css
    @import "tailwindcss";
    @import "@repo/tailwind-config";
    ```
- Keep theme tokens in `packages/tailwind-config/shared-styles.css`.
- Update `apps/web/app/layout.tsx` body classes:
  ```tsx
  <body className={`${GeistSans.className} min-h-dvh bg-background text-foreground antialiased`}>
  ```
- Move the `@xyflow/react` CSS import out of `packages/ui/src/components/task/taskFlow/taskFlow.tsx`.
  - Preferred: add `@import "@xyflow/react/dist/style.css";` to `packages/ui/src/styles.css`, or import it once in `apps/web/app/layout.tsx`.
  - Verify the flow still renders with handles and edges.
- Replace raw colors such as `text-red-400` with `text-destructive` or the appropriate token.

### 10.4 Refactor navigation

- Keep the header links data-driven.
- Add an active-link state.
  - `packages/ui` should not import `next/navigation` if the package is meant to stay framework-neutral.
  - Either accept a `currentPath` prop from `apps/web`, or create the route-aware header in `apps/web` and keep the visual header presentational in `packages/ui`.
- Improve mobile behavior:
  - On narrow screens, allow the nav to wrap or use a compact menu.
  - Ensure the User link remains visible.
- Show the user's display name next to the User link when authenticated, with a max-width and truncation.
- Keep the Logout action on the user page only.

### 10.5 Refactor forms to one source of truth

This is the highest-value code-quality change.

#### Decision editor

Current flow:

- `DecisionBuilder` owns `formValues`.
- `DecisionCard`, `NoulDecisionForm`, `ChoiceDecisionForm`, `ScoreDecisionForm`, and `StateCard` each mirror state through `useDebouncedFormState`.
- Parent and child synchronize with `isLocalChange` refs.

Target flow:

- `DecisionBuilder` owns a single `useForm<DecisionFormValues>`.
- Wrap the editor in `<FormProvider {...methods}>`.
- Child forms use `useFormContext`.
- Use `useFieldArray` for choice options.
- `StateCard` uses `useWatch` to read the current values.
- Save uses `methods.handleSubmit(onSave)`.
- Map the form shape to GraphQL variables in one place:
  ```ts
  type DecisionFormValues = {
    name: string;
    type: DecisionType;
    instruction: string;
    decisionPremise: string;
    options: Array<{ name: string; description: string }>;
  };

  const variables = {
    name: values.name,
    type: values.type,
    instruction: values.instruction,
    decisionPremise: values.decisionPremise,
    options:
      values.type === "choice" || values.type === "score"
        ? values.options.map((option) => option.name)
        : undefined,
    optionDescriptions:
      values.type === "choice"
        ? values.options.map((option) => option.description)
        : undefined,
  };
  ```
- Delete `packages/ui/src/hooks/useDebouncedFormState.ts` once no callers remain.
- Keep `apps/backend/src/schema/ai/ai-queries.ts` unchanged for now.

#### Task editor

Current flow:

- `TaskBuilder` owns `loadedValues` and `formValues`.
- `TaskCard` mirrors `taskResults` in local state and uses `isLocalChange` refs.
- `TaskResultOption` owns a separate debounced form and calls `client.refetchQueries` during render.

Target flow:

- `TaskBuilder` owns one `TaskFormValues` shape, including `taskResults`.
- Use `useFieldArray` for task results.
- Save task fields with `CREATE_TASK` / `UPDATE_TASK`.
- Save each task result with `CREATE_TASKRESULT` / `UPDATE_TASKRESULT` after the task exists.
- Delete results with `DELETE_TASKRESULT` behind a confirmation.
- Use `useMutation` options for refetching:
  ```ts
  const [updateTaskResult] = useMutation(UPDATE_TASKRESULT, {
    refetchQueries: [TASKS, GET_TASK],
    awaitRefetchQueries: true,
  });
  ```
- Remove `client.refetchQueries(...)` from render and from the body of `useDebouncedFormState` callbacks.
- Remove the `console.log` in `TaskBuilder`.

#### Model card

- Remove the render-time `if (description) setValue("description", description);`.
- Initialize the form with `defaultValues: { description: description ?? "" }`.
- Use `reset` when the prop changes, in an effect, or give the card a `key` from the parent.
- Split the card into:
  - `ModelCard` presentational.
  - `ModelCardContainer` (or the parent page) owning `PULL_MODEL` and `UPDATE_MODEL_DESCRIPTION`.
- Fix the pull button state logic. Current conditions such as:
  ```tsx
  loading ||
  data?.installModel?.status !== "success" ||
  data?.installModel?.status !== undefined
  ```
  are effectively always true. Define explicit states: `idle`, `pulling`, `success`, `error`.

#### Auth forms

- Remove `window.location.reload()`.
- Use `setToken` from `useAuth`.
- Add `type="password"` and `autoComplete="current-password"` / `"new-password"`.
- Remove the dead "Forgot your password?" links or implement them.
- Show mutation errors with `FieldError` or an `ErrorState`.

### 10.6 Page-specific rework

#### Landing (`packages/ui/src/pages/landing.tsx`)

- Split the 300-line page into:
  - `StartRunForm`
  - `RunTimeline`
  - `LandingPage` composition
- Keep the current `ChainOfThought` behavior but extract the step mapping into `RunTimeline`.
- When logged out, show a card with a link to `/user` instead of a disabled form.
- Use `PageHeader`, `Card`, and `EmptyState` consistently.
- Improve the run status header so it does not say "Currently not doing anything" when a run has just finished; distinguish idle vs completed.

#### Models (`packages/ui/src/pages/models.tsx` + `modelCard.tsx`)

- Use `PageHeader`.
- Remove the nested card/center wrapper; use a normal vertical list with consistent max width.
- Show a clear empty state when there are no models.
- Separate "add a model by name" from the list.
- Show pull progress as a progress bar or percentage, not only a spinner.
- Add confirmation for any destructive model action if one is added later.
- Use `installedModels` for the user settings picker; `models` can remain the full catalog page.

#### Decisions (`packages/ui/src/pages/decisions.tsx`)

- Keep the master-detail layout on desktop.
- On mobile, switch to list-first then editor (or tabs).
- Replace the "click the selected row again to delete" pattern with an explicit delete icon and confirmation.
- Show an empty state and "Create new decision" action.
- Make the try-prompt result rendering type-safe instead of repeated `(answer as any)[premise]` casts. Create one adapter:
  ```ts
  type SystemOneAnswer =
    | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
    | { type: "score"; score: number; confidence: number; legend?: string; probabilities?: Record<string, number> }
    | { type: "noul"; noul: number };
  ```
- Add loading/error states around `SYSTEM_ONE_PROMPT`.

#### Task queue (`packages/ui/src/pages/taskQueue.tsx`)

- Use a responsive layout:
  - Desktop: flow on top or left, builder on the right.
  - Mobile: tabs or stacked sections with sensible height.
- Add `PageHeader`.
- The flow currently imports CSS in the component; move it as described in 10.3.
- Ensure the flow canvas has a defined minimum height and does not collapse.

#### Login/signup

- Use a shared `AuthLayout` with the same max width and card styling.
- Fix the typo "Create a new accoung".
- Show field-level validation errors.
- Link signup/login to each other.
- If already authenticated, show a concise card linking to `/user`.

#### User page

- Move the local `ProfileCard` / `UserSettingsForm` pieces into:
  - `packages/ui/src/components/user/profile-card.tsx`
  - `packages/ui/src/components/user/user-settings-form.tsx`
- Add explicit success/error feedback after saving settings.
- Explain what each setting does in one sentence under the label.

### 10.7 Clean up shared code

- Remove unused imports and `console.log` calls.
- Prefer generated GraphQL types over hand-copied object shapes:
  - `TaskBuilder` and `TaskCard` currently redeclare task result shapes.
  - Use `GetTasksQuery` / `GetTaskQuery` result types and `Pick`/`Omit` helpers.
- Reduce `any` usage.
  - `StateCard` has several `(data.systemOnePrompt?.answer as any)` casts.
  - Add a narrow adapter function for the JSON scalar.
- Ensure every icon-only button has either visible text or `aria-label`/`title`.
- Ensure every `FieldLabel` matches an input `id`; add `id` to inputs where missing.
- Avoid `useEffect` for derived state where the value can be computed during render.
- Keep effects limited to external synchronization (loading data into a form, subscriptions, localStorage).
- Make the Apollo provider browser-safe:
  - Guard `localStorage` access in `apps/web/app/GraphQlProvider.tsx` with `typeof window !== "undefined"`.
  - The current link reads `localStorage` directly and the client is created with `ssrMode: true`; this can fail during server rendering.
  - Prefer creating the client inside the provider (for example with `useState`) with `ssrMode: false`, or pass the token through context instead of reading storage in the link.

### 10.8 Quality gates for the UI rework

- [x] `pnpm --filter @repo/ui lint`
- [x] `pnpm --filter @repo/ui check-types`
- [x] `pnpm --filter @repo/ui build:components && pnpm --filter @repo/ui build:styles`
- [x] `pnpm --filter web check-types`
- [x] `pnpm --filter web build`
- [x] `pnpm lint`
- [x] `pnpm check-types`
- [x] Removed `typescript.ignoreBuildErrors` from `apps/web/next.config.ts`; `pnpm --filter web build` passes.
- [ ] Manual browser smoke test at desktop and mobile widths (HTTP route/nav smoke checks passed):
  - Logged out: Main/User only; sign-in gate works.
  - Logged in: all links visible; user page settings save; logout works.
  - Decisions: create/edit/delete a decision; try prompt.
  - Task queue: create/edit task, add/delete result, connect flow edges.
  - Models: pull/update description.
  - Landing: default task is preselected; run timeline updates.

---

## 11. File Change Map

### Backend

- `apps/backend/src/db/schema.ts` — add `userSettings`.
- `apps/backend/src/db/relations/relations.ts` — add user/settings relations.
- `apps/backend/src/schema/user/user-settings.ts` — new Pothos type.
- `apps/backend/src/schema/user/user-settings-service.ts` — new service.
- `apps/backend/src/schema/user/user-settings-mutations.ts` — new mutation.
- `apps/backend/src/schema/user/user-settings-queries.ts` — optional query module.
- `apps/backend/src/schema/user/user.ts` — add `settings` relation.
- `apps/backend/src/schema/user/user-queries.ts` — nullable `me`, ensure settings.
- `apps/backend/src/schema/user/user-mutations.ts` — create settings on signup if not done in the service.
- `apps/backend/src/schema/user/user-service.ts` — create settings row on user creation.
- `apps/backend/src/schema/user/index.ts` — export new modules.
- `apps/backend/src/schema/builder.ts` — fix `Context` typing.
- `apps/backend/src/schema/auth.ts` — new `requireUserId` helper (or equivalent).
- `apps/backend/server.ts` — return `null` from auth extraction.
- `apps/backend/src/queue/processor.ts` — per-user model.
- `apps/backend/src/schema/task/task-mutations.ts` — optional `taskId` with default.
- `apps/backend/drizzle/<new migration>/` — generated, do not hand-write unless adding backfill.

### GraphQL client

- `packages/queries/src/user/users-queries.ts` — `ME` includes settings.
- `packages/queries/src/user/user-mutations.ts` — `UPDATE_USER_SETTINGS`.
- `packages/queries/src/model/model-queries.ts` — `INSTALLED_MODELS`.
- `packages/queries/src/tasks/task-mutations.ts` — optional `$taskId`.
- `packages/queries/src/__generated__/**` — generated by codegen, never hand-edited.

### Web app and UI

- `apps/web/app/App.tsx` — auth provider + shared main layout.
- `apps/web/app/GraphQlProvider.tsx` — browser-safe Apollo client/token handling.
- `apps/web/app/layout.tsx` — body classes/theme cleanup.
- `apps/web/app/globals.css` — remove legacy gradient.
- `apps/web/app/user/page.tsx` — new route.
- `apps/web/app/login/page.tsx` — unchanged route, updated UI page underneath.
- `apps/web/app/signUp/page.tsx` — unchanged route, updated UI page underneath.
- `apps/web/next.config.ts` — remove `ignoreBuildErrors` after type cleanup.
- `packages/ui/src/components/auth/auth-provider.tsx` — new.
- `packages/ui/src/components/auth/auth-gate.tsx` — new.
- `packages/ui/src/components/headerMenu/headerMenu.tsx` — auth-aware links.
- `packages/ui/src/pages/user.tsx` — new.
- `packages/ui/src/components/layout/*` — new layout primitives.
- `packages/ui/src/components/feedback/*` — new feedback primitives.
- `packages/ui/src/components/user/*` — profile/settings components.
- `packages/ui/src/pages/landing.tsx` — default task + split timeline.
- `packages/ui/src/pages/decisions.tsx` — auth gate + polish.
- `packages/ui/src/pages/taskQueue.tsx` — auth gate + responsive layout.
- `packages/ui/src/pages/models.tsx` — auth gate + polish.
- `packages/ui/src/pages/login.tsx`, `signUp.tsx` — auth provider integration.
- `packages/ui/src/components/auth/loginForm.tsx`, `signUpForm.tsx` — token handling and form fixes.
- `packages/ui/src/components/decision/**` — form-context refactor.
- `packages/ui/src/components/task/**` — form-context/field-array refactor.
- `packages/ui/src/components/models/modelCard.tsx` — remove render-time side effects, split container.
- `packages/ui/src/hooks/useDebouncedFormState.ts` — delete after migration.
- `packages/ui/src/lib/debounce.ts` — delete if no longer used.
- `packages/ui/src/styles.css` — add `@xyflow/react` import if moved here.

---

## 12. Acceptance Criteria

### Requirement 1: Per-user saved settings

- [x] A `userSettings` row exists for every user (eager on signup, lazy for existing users).
- [x] Settings are keyed by `userId` and cannot be read or written for another user.
- [x] `me.settings` returns the authenticated user's settings.
- [x] `updateUserSettings` persists changes, supports clearing with `null`, and validates task/model references.
- [x] The queue uses `defaultModelName` for that user's run and falls back to `tev1:4b` when unset.
- [x] The landing page preselects `defaultTaskId` when it is still valid.
- [x] `createQueuedTask` falls back to `defaultTaskId` when `taskId` is omitted.
- [x] Settings survive logout/login and page reload.
- [x] Two different users see different settings.

### Requirement 2: User page instead of header Logout

- [x] The header has no Logout button.
- [x] A `/user` page exists.
- [x] Logged-in users see profile information, their queue settings, and a Logout button.
- [x] Logout removes the token, clears Apollo state, and returns to `/user`.
- [x] Saving settings shows success/error feedback.

### Requirement 3: Logged-out navigation

- [x] `me` returns `null` when there is no valid token.
- [x] Logged-out users see only **Main** and **User** in the header.
- [x] Protected pages show a sign-in gate instead of data.
- [x] Logged-in users see Main, Decisions, Task queue, Models, and User.

### Requirement 4: UI rework

- [x] All pages use a shared page container/header.
- [x] Loading, empty, and error states are explicit.
- [x] Form state has one source of truth per editor.
- [x] No Apollo refetch/cache side effects run during render.
- [x] Destructive actions require confirmation.
- [x] Icon-only buttons have accessible names.
- [ ] Responsive layouts visually verified at mobile and desktop widths (implemented; only HTTP nav/route smoke checks were run).
- [x] `pnpm lint`, `pnpm check-types`, and `pnpm build` pass.
- [x] `apps/web/next.config.ts` no longer ignores build type errors (after cleanup).

---

## 13. Risks, Edge Cases, and Follow-Ups

- **Existing users without settings:** handled by `ensureUserSettings`; optionally backfill during migration.
- **Deleted default task/model:** FK `onDelete: set null` clears the setting. Verify the generated migration includes these constraints.
- **Model name changes/deletions:** `defaultModelName` is a FK to `models.name`; renaming a model would require updating settings or adding `onUpdate: cascade`.
- **Queue runs from deleted users:** `queued_by` has no FK today. `modelForUser` safely falls back when no settings row exists.
- **Multiple models or per-step model selection:** current plan stores one default. If needed, replace the single column with a join table and select a model when creating the queued task.
- **Literal queue ordering:** current plan uses a default starting task. If queued tasks must be automatically seeded in a specific order, add a separate `userQueueItems` table and a "start my queue" mutation.
- **Auth token contents:** `login` and `createUser` currently sign `{ aud, user }` where `user` includes `hashedPassword`. This is outside the requested scope, but it should be removed from the JWT payload as a security hardening follow-up.
- **Codegen depends on a running API:** always start the backend before regenerating client documents.
- **UI moved files can break exports:** after moving files, run `pnpm --filter @repo/ui build:components && pnpm --filter @repo/ui build:styles` and update imports in `apps/web` if route-facing names change.
- **Apollo cache normalization:** `UserSettings` has no `id` field. Use `refetchQueries: [ME]` after updating settings rather than relying on normalized cache updates.
