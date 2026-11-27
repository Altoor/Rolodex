# Ready-to-deploy fixes + private/root folders

Live checklist for the review of `feature/ready-to-deploy` plus the two new
features. Checked items are implemented in the working tree. The bundled
Ollama profile/default stays unchanged.

## Review fixes

- [x] Compose Manager Plus docs: use a standard compose filename (`compose.yml`).
- [x] Document that changing `API_PUBLIC_ORIGIN` recreates web **and** backend.
- [x] Require `ROLODEX_DATA_DIR` in `compose.unraid.yml`; never fall back to USB.
- [x] Add a `NEXT_PUBLIC_API_ORIGIN` → `API_PUBLIC_ORIGIN` migration note.
- [x] Require `API_PUBLIC_ORIGIN` in the Unraid stack and pass it to backend.
- [x] Add pull-request Docker build validation to the publish workflow.
- [x] Spell out the direct-tailnet `API_PUBLIC_ORIGIN` / `API_CORS_ORIGINS` values.
- [x] Remove runtime-only `API_PUBLIC_ORIGIN` from Turbo `globalEnv`; declare it
      in `globalPassThroughEnv` so the API lint rule stays satisfied without
      invalidating build caches.
- [x] Make `normalizeApiOrigin("/")` return `undefined`; add a test.
- [x] Keep UI test files out of the library build output.
- [x] Add a backend `/health` endpoint; make web wait for a healthy backend.
- [x] Replace the backend `env_file` in `compose.unraid.yml` with explicit env.

## Configurable files directory

- [x] Add `ROLODEX_FILES_DIR` to the Unraid compose file, mapped to `/app/files`.
- [x] Document `ROLODEX_FILES_DIR` in `unraid.env.example` and README.
- [x] Use `${ROLODEX_FILES_DIR:-./files}` in the local compose files too.
- [x] Confirm the backend still uses `FILES_ROOT=/app/files` inside containers.

## Private and root folders — data + access

- [x] Add `ownerId`, `isPrivate`, and `isRoot` to `fileEntries`.
- [x] Add a shared access module: ancestor-aware SQL predicate, path checks,
      hidden-folder lookup, and scan-report filtering.
- [x] Make entry lookup/list helpers viewer-aware.
- [x] Expose `ownerId`, `private`, and `root` on the GraphQL `FileEntry` type.
- [x] Filter `fileEntries`/`getFileEntry`/`getFileText` by the viewer.
- [x] Enforce access in `createFileEntry`, `updateFileEntry`, `deleteFileEntry`,
      and `writeFileText`; allow folders to set `private`/`root`.
- [x] Enforce access for streaming and GraphQL uploads.
- [x] Enforce access when issuing and verifying file-view tokens.
- [x] Make all file tools resolve parents/sources with the run's `userId`.
- [x] Refuse to reuse another user's hidden private folder by name in
      `create_folder` and `move_files`.
- [x] Filter vector, lexical, and decision-model search by access.
- [x] Treat accessible `root` folders as the task search root; search only
      inside them (fall back to the whole accessible tree when none exist).
- [x] Make `create_file`/`create_folder` default to the configured root folder
      when no parent is supplied; no root falls back to the files-tree root.
- [x] Enforce a single root folder: marking a folder as root clears the previous
      root (including live-update events for the cleared folder).
- [x] Show small lock/root badges at the right of folder rows in the file tree.
- [x] Add tests for default-root selection and verify against a temp database.
- [x] Hide private paths from `scan_files`, `indexFileTree`, and subscriptions.

## UI

- [x] Add `private`, `root`, and `ownerId` to the query fragment and UI type.
- [x] Add private/root controls for folders in the metadata editor.
- [x] Show private/root state in file metadata.
- [x] Regenerate GraphQL types for `packages/queries` (the web app has no file
      documents of its own).
- [x] Fix the `useAuth must be used inside AuthProvider` crash when opening run
      history: compiled `dist` output still used `#components/...` aliases that
      resolved back into `src/`, creating a second auth context. `build:components`
      now rewrites those aliases to relative `dist` imports so consumers load a
      single module graph.

## Validation

- [x] Add/adjust tests for access filtering and origin normalization.
- [x] Run `pnpm test` (152 passed), `pnpm check-types` (11/11 tasks),
      `pnpm lint` (8/8 tasks).
- [x] Validate all compose files, `actionlint`, both Docker targets, and the
      backend `/health` endpoint in a built image.
- [x] End-to-end GraphQL check with two users: the second user does not see the
      private folder or its child, cannot open either by id, cannot create
      inside it, and cannot mint a view token.
- [x] Applied the additive `fileEntries` columns/indexes to the local dev
      database (the full `drizzle-kit push` still asks about old trial schemas).

## Todo author/actor permissions (follow-up)

Actors are assignees: they may see a todo and toggle done/not done, but only
the author may change anything else.

- [x] Add shared `canViewTodo` / `canMarkTodoDone` / `canManageTodo` helpers.
- [x] GraphQL: `markTodoDone` allows author **and** actor; `updateTodo`,
      `archiveTodo`, and `deleteTodo` are author-only and return `FORBIDDEN`
      for actors (non-viewers still get `no todo found`).
- [x] GraphQL: `createTodo`/`updateTodo` validate that `actor_id` references an
      existing user; the caller is always the author.
- [x] Tools: `update_todo` lets an actor change only `done`;
      `archive_todo`/`delete_todo`/`delete_todos_older_than` are author-only.
- [x] UI: assigned todos keep the done checkbox but hide edit/archive/delete.
- [x] Tests: 156 passed (4 new permission tests), `pnpm check-types` 11/11,
      `pnpm lint` 8/8.
- [x] End-to-end GraphQL check with author, actor, and a third user covering
      visibility, done toggling, forbidden edits, reassignment, and invalid
      `actor_id`.
- [x] Built the backend image for the E2E run and the web Docker target for the
      UI changes.

## Internal workspace and attachment hardening (follow-up)

Trial copies of private files keep the original relative path below
`.trials/<run>/<attempt>/`, so path-based privacy alone does not hide them.
Uploads under `.tmp` are staging artifacts and must never be user-visible.

- [x] Mark `.trials` and `.tmp` as internal in the shared path helpers; skip
      both while walking the tree.
- [x] Reject an explicit manifest scan rooted at an internal path.
- [x] Hide internal paths from entry lookups/lists, path access checks, scan
      reports, and subscription events for every user.
- [x] Filter `createQueuedTask` and assisted-run attachments through the
      viewer's access predicate before they enter `toolState`.
- [x] Add `paths.test.ts` coverage for internal roots, nested internal paths,
      system files, and normal user paths.
- [x] Run `pnpm test` (163 passed), `pnpm check-types` (11/11 tasks), and
      `pnpm lint` (8/8 tasks).
- [x] End-to-end GraphQL check against a separate database: user 4 cannot see
      or open the private folder/child, cannot attach the private id or a live
      trial copy, and can still attach a public file; the owner sees the
      private entries while internal paths stay hidden from everyone.
