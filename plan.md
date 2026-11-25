# Outward-Facing API Plan

Status: **implemented on the working tree**. See §11 for the delivered
surface and verification notes.

Goal: expose a small, standard REST API from the backend and an `/api` page
for managing it. Each API endpoint is linked to a task. A request to the
endpoint queues that task as a normal standard run, replies with an acceptance
receipt, and can be watched over HTTP polling or a WebSocket. A new `end_flow`
tool lets a flow publish a chosen part of its data as the API result, and shows
the same block in the landing run view.

---

## 1. Locked decisions

| Topic | Decision |
|---|---|
| Feature home | New package `packages/api` (`@repo/api`). HTTP routing, auth, request parsing, flow snapshots and endpoint persistence live there. |
| Execution | API requests reuse the existing standard queue and `createQueuedTask`. No new run mode. |
| Auth | Per-endpoint API key (`ak_…`), stored as a SHA-256 hash. Accepted via `Authorization: Bearer` or `X-API-Key`; WebSocket may use `?key=`. Full key is shown once on create/rotate. |
| URL model | `POST /api/hooks/:slug` invokes. `GET /api/hooks/:slug/requests/:requestId` returns status/result. `GET /api/hooks/:slug/requests/:requestId/ws` and `…/ws` upgrade to WebSocket. The slug is chosen by the user (lowercase letters, numbers, `-`, `_`) or generated randomly. |
| Request body | JSON is serialized as the task state. `stateField` selects one JSON/form field instead. Plain text is used verbatim. Multipart fields follow the same rule and files are attached through the existing upload pipeline. |
| Result extraction | The terminal run status plus the completed `end_flow` step output (or `null`). Failed runs expose the failed step note as `error`. |
| `end_flow` tool | Ends the run even when a fallback task exists. Its config selects any part of the accumulated tool state (`path`, `where`, `select`, `block`), optionally includes the full state/tool state, and sets a message. Output is renderable by the existing block registry. |
| Endpoint administration | GraphQL for the `/api` page (list/create/update/rotate/delete). The outward REST surface stays small. |
| Extensibility | `@repo/api` exposes a route-table router. Backend registers the built-in routes and can add routes later without touching the HTTP server. |
| WebSocket result | Send `accepted`, then a `status` snapshot on every queue event (and a short fallback interval), then `done` and close when terminal. |

---

## 2. Database

New tables in `packages/db/src/schema.ts`:

### `apiEndpoints`

- `id` uuid PK
- `userId` → users (delete cascade), indexed
- `name`, `description`
- `slug` unique, URL-safe; custom lowercase slugs are validated and checked for
  collisions, otherwise a random token is generated
- `taskId` → tasks (delete cascade)
- `keyHash`, `keyPrefix`, `keyLastFour`
- `stateField` nullable text
- `enabled` boolean (default true)
- `createdAt`, `updatedAt`

### `apiRequests`

- `id` uuid PK
- `endpointId` → apiEndpoints (delete cascade), indexed
- `userId` → users (delete cascade)
- `runId` → runs (delete cascade), unique
- `state` text snapshot of the submitted state
- `createdAt`

A manual SQL migration is added under `apps/backend/drizzle/`. Dev/Docker uses
`drizzle-kit push`, so the schema stays authoritative.

---

## 3. Package layout (`packages/api`)

```
src/
  index.ts                     exports router, repository, runtime types
  domain/
    types.ts                   endpoint/request/flow status types
    keys.ts                    key generation + hash/verify
    request-input.ts           JSON/text/multipart → state + files
    flow-status.ts             run + steps → FlowStatusResponse
  repository/
    endpoints.ts               CRUD by user / slug
    requests.ts                create + lookup by endpoint
  http/
    router.ts                  method + path table, route matching
    respond.ts                 JSON, CORS, errors
    invoke-route.ts            POST hook
    status-route.ts            GET request status
    websocket.ts               upgrade handling + live snapshots
```

Runtime dependencies supplied by the backend:

```ts
interface ApiRuntime {
  queueFlow(input: {
    userId: number;
    taskId: number;
    state: string;
    fileIds?: number[];
  }): Promise<{ runId: string; stepId: number }>;
  uploadFiles(files: File[]): Promise<{ id: number }[]>;
  onRunEvent(runId: string, listener: () => void): () => void;
}
```

This keeps queue/file internals in the backend while all API behaviour lives in
the package.

---

## 4. REST contract

### Invoke

`POST /api/hooks/:slug`

```json
{
  "accepted": true,
  "requestId": "uuid",
  "runId": "uuid",
  "status": "accepted",
  "statusUrl": "http://…/api/hooks/<slug>/requests/<requestId>",
  "websocketUrl": "ws://…/api/hooks/<slug>/requests/<requestId>/ws"
}
```

Status `202`. Errors: `400` bad body, `401` bad/missing key, `404` unknown or
disabled endpoint, `405` unsupported method, `413` body too large.

### Status

`GET /api/hooks/:slug/requests/:requestId`

```json
{
  "requestId": "uuid",
  "runId": "uuid",
  "status": "running|awaiting_input|completed|failed|cancelled",
  "submittedAt": "…",
  "finishedAt": "…|null",
  "result": {},
  "error": "…|null",
  "steps": [
    { "id": 1, "taskId": 2, "taskName": "…", "status": "completed",
      "summary": "…", "note": "…", "queuedAt": "…" }
  ]
}
```

### WebSocket

- `…/requests/:requestId/ws?key=…` subscribes to an existing request.
- `…/ws?key=…` waits for one JSON message, invokes, then streams it.
- Messages: `{ "type": "accepted" | "status" | "done" | "error", … }`.

---

## 5. `end_flow` tool

Registry entry (`packages/tools/src/tools/end/endFlow.ts`):

```json
{
  "message": "Optional summary",
  "path": "todo",
  "where": { "eq": { "path": "done", "value": true } },
  "select": "all",
  "block": "todo",
  "includeState": false,
  "includeToolState": false
}
```

Output:

```json
{
  "done": true,
  "message": "…",
  "block": "todo",
  "items": [],
  "count": 0,
  "path": "todo",
  "state": "…",        // only when includeState
  "toolState": []       // only when includeToolState
}
```

`ToolExecution` gains `endFlow?: boolean`. The tool-step processor forces
`nextTaskId = null` when set, and records `endFlow` on the step result. The
existing standard-run settlement marks the run completed. `Block` renders the
selected `items` for `end_flow` exactly like `display_block`.

---

## 6. Backend wiring

- `server.ts` creates the API router with the runtime, handles matching HTTP
  requests before Yoga, and forwards `upgrade` events to the router.
- GraphQL additions:
  - types `ApiEndpoint`, `ApiRequest`, `CreatedApiEndpoint`
  - queries `apiEndpoints`, `apiRequests(endpointId, limit)`
  - mutations `createApiEndpoint`, `updateApiEndpoint`,
    `rotateApiEndpointKey`, `deleteApiEndpoint`
- All admin operations are scoped to `requireUserId(ctx)`.

---

## 7. `/api` page

- New nav item and `apps/web/app/api/page.tsx` wrapper.
- `packages/ui/src/pages/api.tsx`.
- Components under `packages/ui/src/components/api/`:
  - endpoint list with enabled state and task name
  - create form (name, optional custom URL slug, task, description, optional
    state field)
  - one-time key banner with copy buttons
  - per-endpoint URLs: invoke, status, WebSocket
  - update (name/task/description/state field/enabled), rotate key, delete
  - recent requests (status + submittime) for quick confirmation
- Reuse `API_ORIGIN`, `Card`, `Field`, `Input`, `Button`, `Badge`.

---

## 8. Phases

- [x] 1. Add DB tables + migration.
- [x] 2. Add `end_flow` tool and processor stop support; extend `Block`.
- [x] 3. Create `@repo/api` package: keys, endpoint/request repository, flow snapshot.
- [x] 4. Implement request parsing + REST router (invoke/status/health).
- [x] 5. Implement WebSocket upgrade and live status stream.
- [x] 6. Wire the runtime into `server.ts`; add GraphQL admin API.
- [x] 7. Add query documents + regenerate GraphQL types.
- [x] 8. Build the `/api` page and navigation.
- [x] 9. Verify: typecheck, lint, tests, build, a real invoke → status →
      end_flow smoke, WebSocket smoke.
- [x] 10. Document the API in `packages/api/README.md` with curl and JS
      examples.

---

## 9. Verification targets

- JSON request queues the assigned task and returns `202` with URLs.
- API key is required and scoped to one endpoint.
- Multipart request attaches files using the existing upload pipeline.
- Status polling reports accepted/running/completed and the `end_flow` output.
- `end_flow` stops the chain even when the task has a fallback task and shows
  its block in the landing run view.
- WebSocket invocation/subscription streams snapshots and closes on terminal.
- Disabled endpoints return `404`; rotating a key invalidates the old one.
- Existing assisted/standard behaviour remains unchanged.

---

## 10. Non-goals / follow-ups

- No REST CRUD for endpoints; GraphQL is the admin plane.
- No idempotency keys, rate limits, OAuth, or multi-user key sharing yet.
- No answering `userDecision` steps through the API (status reports
  `awaiting_input`); a follow-up can add an answer route.
- No binary/streaming response bodies; results are JSON.

---

## 11. Implementation status

Delivered on the working tree (uncommitted):

- **Database** — `apiEndpoints` and `apiRequests` tables, relations, and
  migration `apps/backend/drizzle/20261124150000_api_endpoints/` with a
  snapshot so `drizzle-kit generate` reports no pending changes.
- **`@repo/api`** — key generation/hash verification, custom or random endpoint
  slugs with validation/collision handling, endpoint/request repositories, flow
  snapshot read model, JSON/text/multipart parsing, the route-table HTTP router
  with CORS/health, WebSocket invoke and subscribe streaming, and `README.md`
  with the curl/JS contracts.
- **`end_flow` tool** — registered, validates `message`/`path`/`where`/
  `select`/`block`/`includeState`/`includeToolState`, emits `endFlow`, stops
  the chain, records the flag on the step result, and renders its `items`
  through `Block`. Task builder path hints include it.
- **Backend wiring** — `apps/backend/src/api/runtime.ts` adapts the standard
  queue, upload pipeline and queue events; `server.ts` dispatches HTTP requests
  and upgrade events to the router before Yoga.
- **GraphQL admin plane** — `ApiEndpoint`, `ApiRequest`, `ApiRequestStatus`,
  `CreatedApiEndpoint`; `apiEndpoints`, `apiRequests`; create/update/rotate/
  delete mutations, all user-scoped. Query documents generated for the UI.
- **`/api` page** — create form with an optional custom URL slug, one-time key
  banner, endpoint cards with invoke/status/WebSocket URLs and a curl example,
  edit (including slug)/enable/rotate/delete, recent requests, task selection,
  nav entry, and `apps/web/app/api/page.tsx`.

Verification performed:

- `pnpm check-types`, `pnpm lint` (0 errors; 30 pre-existing backend
  warnings), `pnpm test` (77 passing), and `pnpm build` with `/api` in the
  Next route list.
- Live smoke: JSON invoke → `202`, status polling → `completed` with the
  `end_flow` result, multipart file attachment, WebSocket invoke streaming
  `accepted` → `status` → `done`, key rotation (old key → `401`, new key
  works), and cleanup of all smoke rows/files.
- GraphQL `ApiEndpoint.task` resolver and endpoint deletion verified.

---

# Foreach Join Barrier Plan (Option C)

Status: **implemented on the working tree**; all phases verified. See §10.

Goal: a `foreach` task can name an **"After all items"** task. Every per-item
branch runs as before, but the named task only starts once every branch has
reached a terminal state. The new `join` tool exposes the collected branch
results, and a normal `end_flow` after the join can publish them. `end_flow`
stays a simple, separate tool.

## 1. Locked decisions

| Topic | Decision |
|---|---|
| Barrier model | Explicit queue barrier (Option C), not read-time aggregation. A waiting join row exists from fan-out until all branches settle. |
| New task edge | `tasks.joinTaskId`, optional, only for `toolOutputType = "foreach"`. The target is a normal task (recommended: a task using the `join` tool). |
| Queue lineage | `queuedTasks.forkGroupId` (uuid), `forkIndex` (integer, per-item ordinal), `isJoin` (boolean). All rows in a branch inherit the group and index. |
| Queue status | New `waiting` status. A join row starts in `waiting` and is released to `queued` by a central sweep. |
| `end_flow` | Unchanged. It still stops the chain and publishes a selection from tool state. |
| `join` tool | New read-only tool. Emits `{ kind: "join", count, completed, failed, branches }` and appends it to toolState by default, so `end_flow` can select `branches`. |
| Zero items | With a join configured, the join still runs (immediately) so the downstream flow continues with an empty result. |
| Nested fan-out | A `foreach` inside an active branch is rejected with a clear failure note (single-group lineage cannot represent nested barriers safely). |
| Flowchart | Tasks reachable from a foreach's per-item entry until its join get a distinct dashed border. The join and everything after it are normal again. |
| Result preference | The API publishes the last completed `end_flow`; after-fan-in `end_flow` rows (no `forkGroupId`) win over branch-local ones. |

## 2. Database

- `tasks.joinTaskId integer` nullable.
- `queuedTasks.forkGroupId uuid` nullable, indexed.
- `queuedTasks.forkIndex integer` nullable.
- `queuedTasks.isJoin boolean default false not null`.
- `queuedTaskStatus` gains `waiting`.
- Migration + snapshot under `apps/backend/drizzle/`.

## 3. Queue contracts

### Fan-out (`planForeach`)

Inputs gain `joinTaskId` and a generated `forkGroupId`.

- Prefix the failure checks as today.
- Create one branch row per item with `forkGroupId`, `forkIndex = index`,
  `isJoin = false`.
- If `joinTaskId` is set, also create one join row:
  - `taskId = joinTaskId`, `isJoin = true`, `forkIndex = null`,
    `forkGroupId = group`, `status = items.length > 0 ? "waiting" : "queued"`.
- `nextTaskId` still points at the per-item task.
- Propagate `forkGroupId`/`forkIndex` through every continuation insert:
  normal tool next, decision next, user-decision next, assisted accept,
  apply-revision, wire-decision-target, and retry.
- A join's own continuation drops the fork lineage (`isJoin` row → normal row
  without `forkGroupId`/`forkIndex`), so after-fan-in tasks are unmarked.
- Reject `foreach` when `row.forkGroupId != null`.

### Release sweep

`releaseReadyJoins(runId?)`:

1. Load `waiting` join rows (optionally for one run).
2. For each, check sibling rows with the same `forkGroupId` and
   `isJoin = false` whose status is active (`queued`, `running`,
   `awaiting_input`, `waiting`).
3. When none remain, update the join to `queued` and publish it.

Call the sweep at the start of `settleStandardRunIfIdle` and
`completeRunIfIdle`, and after assisted enqueues in `acceptAttempt`.
Include `waiting` in all active-status lists, dismiss/cancel lists, and the
`activeQueuedTasks` query.

## 4. Join execution

- `ToolRunContext` gains `fork?: { groupId, branches }`.
- Backend loads branches when `row.isJoin` is true: same `forkGroupId`,
  `isJoin = false`, ordered by `forkIndex`, `depth`, `id`; the last terminal row
  per index is that branch's result.
- `join` tool config: `includeResults` (default true), `includeToolState`
  (default false), `includeState` (default false), `appendState` (default true).
- Output is structured, deterministic, and read-only.
- Missing fork context throws a clear `ToolInputError`.

## 5. GraphQL / services / transfer

- `Task.joinTaskId` field and create/update args; validation for foreach-only
  use and target existence.
- `QueuedTask` exposes `forkGroupId`, `forkIndex`, `isJoin`; status enum gains
  `waiting`.
- Delete-task cleanup clears `joinTaskId`.
- Task transfer exports/imports/remaps `joinTaskId`.
- Regenerate GraphQL types.

## 6. Task builder and flowchart

- Form value `joinTaskId`; snapshot and mutation variables include it.
- `toolTaskFields` shows an "After all items" selector when the tool supports
  foreach and `toolOutputType = "foreach"` (join, i.e. `NO_BRANCH_TASK`, means
  no barrier).
- Flow:
  - `JOIN_HANDLE_ID = "join"` source handle, parsed as `joinTaskId`.
  - Edge id prefix `e-join-`, dashed distinct edge.
  - Layout includes the join edge.
  - Node data includes `toolOutputType`, `joinTaskId`, and `fannedOut`.
  - `computeFannedOutTaskIds` walks from each foreach's per-item entry until
    its join and marks visited nodes.
  - Fanned-out nodes render with a slightly different dashed border; selected
    ring still wins.

## 7. API / run views

- API step snapshots include `forkIndex` and `isJoin`.
- Result selection prefers completed `end_flow` rows outside a fork, then falls
  back to the last one.
- Landing and assisted step status map `waiting` to `pending` and show a
  "waiting for branches" detail.
- `waiting` is not `awaiting_input` for API status; the run still reports
  `running`.

## 8. Phases

- [x] 1. Schema, enum, migration, snapshot.
- [x] 2. Queue lineage, fan-out join row, release sweep, active lists.
- [x] 3. `join` tool, context/backend loading, tests.
- [x] 4. GraphQL, task service, transfer, codegen.
- [x] 5. Task builder + flowchart edge/border.
- [x] 6. API snapshot and status rendering.
- [x] 7. Verify typecheck/lint/test/build and live standard foreach → join →
      `end_flow` runs (parallel, zero items, failure, retry). Assisted/API
      propagation is covered by the shared enqueue and snapshot contracts,
      not a separate live smoke.

## 9. Edge cases

- Zero items → join queued immediately, no branch rows.
- One or more failed branches → join still releases; run outcome remains failed
  by the existing standard-run rule, but the join can expose partial results.
- Retry a branch → retry keeps `forkGroupId`/`forkIndex`. Because a failed
  branch is already terminal, the join may have released before the retry; the
  retry then continues that branch and reopens the run, but the join does not
  run twice.
- Dismiss/cancel → `waiting` rows are completed with the rest of the run.
- Assisted runs → enqueues happen before the sweep; the run cannot settle while
  a join is still `waiting`.
- Missing/deleted join task → join row fails with "task no longer exists" like
  any other step; no deadlock because it is no longer `waiting`.
- Nested foreach → explicit step failure instead of a silent early join.

## 10. Verification

- Migration `20261125091244_foreach_join_barrier` generated and applied to the
  dev database (`waiting` enum value, fork columns, join index).
- `pnpm check-types`, `pnpm lint` (0 errors, 30 pre-existing backend warnings),
  `pnpm test` (91 tests), and `pnpm build` all pass.
- New tests cover the fan-out plan (branches + waiting join, zero items,
  no-join lineage, nested rejection), the `join` tool (ordering, optional
  payloads, missing context), and the flowchart fan-out border walk.
- Live standard runs:
  - `scan_files` foreach → per-item `set_state` → `join` → `end_flow`: two
    branches joined and published through the post-fan-in `end_flow`.
  - zero items: join queued immediately, `count: 0`, empty result published.
  - one failing branch: join released after the failure and ran without manual
    intervention, then the post-fan-in `end_flow` published.
  - retry: a failed branch retried successfully and the run settled
    `completed`.
- Queue wake-up race fixed: `triggerQueue()` now records a rerun request when
  the loop is already active, and `releaseReadyJoins()` triggers the queue
  after releasing a barrier. This prevents the loop from exiting between the
  last branch finishing and its join becoming runnable.
- Smoke data removed; the pre-existing "Device call" endpoint is untouched.
