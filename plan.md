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
| URL model | `POST /api/hooks/:slug` invokes. `GET /api/hooks/:slug/requests/:requestId` returns status/result. `GET /api/hooks/:slug/requests/:requestId/ws` and `…/ws` upgrade to WebSocket. |
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
- `slug` unique, random URL-safe token
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
  - create form (name, task, description, optional state field)
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
- **`@repo/api`** — key generation/hash verification, endpoint/request
  repositories, flow snapshot read model, JSON/text/multipart parsing, the
  route-table HTTP router with CORS/health, WebSocket invoke and subscribe
  streaming, and `README.md` with the curl/JS contracts.
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
- **`/api` page** — create form, one-time key banner, endpoint cards with
  invoke/status/WebSocket URLs and a curl example, edit/enable/rotate/delete,
  recent requests, task selection, nav entry, and `apps/web/app/api/page.tsx`.

Verification performed:

- `pnpm check-types`, `pnpm lint` (0 errors; 30 pre-existing backend
  warnings), `pnpm test` (77 passing), and `pnpm build` with `/api` in the
  Next route list.
- Live smoke: JSON invoke → `202`, status polling → `completed` with the
  `end_flow` result, multipart file attachment, WebSocket invoke streaming
  `accepted` → `status` → `done`, key rotation (old key → `401`, new key
  works), and cleanup of all smoke rows/files.
- GraphQL `ApiEndpoint.task` resolver and endpoint deletion verified.
