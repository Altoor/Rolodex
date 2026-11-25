# @repo/api

The outward-facing REST/WebSocket API. Endpoint administration lives in
GraphQL; this package owns the public request surface, authentication and flow
status read model.

## Endpoint model

Each API link stores:

- a URL `slug` used in the URL (chosen by you or generated randomly)
- an assigned `taskId`
- a SHA-256 hashed API key (shown once when created or rotated)
- an optional `stateField` used to pick the task state from a JSON/form body

Create and manage links from the `/api` page. The backend wires the package to
the existing standard queue through `ApiRuntime`.

## Health

`GET /api/health` is unauthenticated and returns `{ "ok": true }`. Use it for a
load balancer or container liveness probe.

## Authentication

Send one of:

```http
Authorization: Bearer ak_…
X-API-Key: ak_…
```

WebSocket clients may use `?key=ak_…` instead, because browsers cannot set
headers on a WebSocket handshake. Query-string keys are accepted **only** on
WebSocket upgrades; HTTP routes such as invoke and status reject `?key=` and
require a header. Use TLS when exposing the API.

`/api/v1` is stricter: it accepts only the dedicated standard key (see below),
not endpoint keys. Endpoint keys can invoke one hook but cannot read account
resources.

## Invoke

```sh
curl -X POST 'http://localhost:4000/api/hooks/<slug>' \
  -H 'Authorization: Bearer ak_…' \
  -H 'Content-Type: application/json' \
  -d '{"state":"Summarise this support ticket"}'
```

Attach one or more files with `multipart/form-data`. Each repeated `files`
field is uploaded and seeded into the run's toolState as
`{ uploaded: true, files: [...] }` before the first task:

```sh
curl -X POST 'http://localhost:4000/api/hooks/<slug>' \
  -H 'Authorization: Bearer ak_…' \
  -F 'state=Summarise these attachments' \
  -F 'files=@./ticket.txt' \
  -F 'files=@./screenshot.png'
```

Response (`202`):

```json
{
  "accepted": true,
  "requestId": "uuid",
  "runId": "uuid",
  "status": "accepted",
  "statusUrl": "http://localhost:4000/api/hooks/<slug>/requests/<requestId>",
  "websocketUrl": "ws://localhost:4000/api/hooks/<slug>/requests/<requestId>/ws"
}
```

Body handling:

| Body                  | State                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `application/json`    | `stateField` value, a top-level `state` string, or the whole JSON body pretty-printed             |
| `text/plain`          | Raw text                                                                                          |
| `multipart/form-data` | `stateField`, then `state`/`message`/`prompt`/`text`, then all fields as JSON; files are attached |

Limits: 5 MiB for JSON/text, 20 files, 25 MiB per file, and 50 MiB for the whole
multipart request. A request that exceeds any limit is rejected with `413`.

## Status

```sh
curl 'http://localhost:4000/api/hooks/<slug>/requests/<requestId>' \
  -H 'Authorization: Bearer ak_…'
```

```json
{
  "requestId": "uuid",
  "runId": "uuid",
  "status": "running|awaiting_input|completed|failed|cancelled",
  "endpoint": { "id": "uuid", "name": "…", "slug": "…" },
  "submittedAt": "…",
  "finishedAt": "…",
  "result": { "done": true, "items": [] },
  "error": null,
  "steps": [
    {
      "id": 1,
      "taskId": 2,
      "taskName": "…",
      "toolKey": "…",
      "status": "completed",
      "summary": "…",
      "note": null,
      "queuedAt": "…"
    }
  ]
}
```

`result` is the output of the last completed `end_flow` step. Without one it is
`null`.

## WebSocket

Subscribe to an existing request:

```
ws://localhost:4000/api/hooks/<slug>/requests/<requestId>/ws?key=ak_…
```

Or invoke over WebSocket by opening the invoke socket and sending one JSON
message:

```
ws://localhost:4000/api/hooks/<slug>/ws?key=ak_…
```

Messages:

```json
{ "type": "accepted", "requestId": "…", "runId": "…", "statusUrl": "…" }
{ "type": "status", "data": { "...": "FlowSnapshot" } }
{ "type": "done", "data": { "...": "FlowSnapshot" } }
{ "type": "error", "error": "…" }
```

The socket closes after `done` (or an error). Binary messages are rejected; use
the HTTP multipart route for files.

## `end_flow`

Tasks can end a chain and publish a result with the `end_flow` tool:

```json
{
  "message": "Imported",
  "path": "todo",
  "where": { "eq": { "path": "done", "value": true } },
  "select": "all",
  "block": "todo",
  "includeState": true,
  "includeToolState": false
}
```

`path`/`where` select items from the accumulated tool state exactly like
`display_block`. `includeState` adds the current state string, and
`includeToolState` adds the whole tool state. `endFlow` is stored on the step
result, forces the chain to stop even when a fallback task exists, and the same
selection is rendered as a block in the landing run view.

## Standard API

`/api/v1` exposes user-scoped REST resources. Create or rotate a dedicated
standard key from the Standard API card on `/api`. Endpoint keys are intentionally
rejected here: they are scoped to a single hook and must not grant account-wide
access. The key's owning user scopes every response. Send it with
`Authorization: Bearer ak_…` or `X-API-Key: ak_…` (query-string keys are not
accepted on HTTP routes).

### List todos

`GET /api/v1/todos` returns the user's todos sorted by due date (undated last),
then by id.

| Query             | Default | Meaning                                                       |
| ----------------- | ------- | ------------------------------------------------------------- |
| `done`            | `all`   | `all`, `true`, or `false` (`notDone` is an alias for `false`) |
| `limit`           | `50`    | Page size, 1–200                                              |
| `offset`          | `0`     | Rows to skip                                                  |
| `includeArchived` | `false` | Include archived todos                                        |

```sh
curl 'http://localhost:4000/api/v1/todos?done=false&limit=25' \
  -H 'Authorization: Bearer ak_…'
```

```json
{
  "items": [
    {
      "id": 42,
      "name": "File invoices",
      "description": "Before the accountant calls",
      "done": false,
      "doByDate": "2026-11-30T09:00:00.000Z",
      "createdAt": "2026-11-24T11:41:00.000Z",
      "archivedAt": null,
      "authorId": 1,
      "actorId": 1
    }
  ],
  "pagination": {
    "limit": 25,
    "offset": 0,
    "total": 1,
    "hasMore": false,
    "nextOffset": null
  }
}
```

`nextOffset` is `null` on the last page; otherwise pass it back as `offset`.

### Mark a todo done or not done

`PATCH /api/v1/todos/:id` updates the `done` flag. A todo outside the key
owner's scope returns `404`.

```sh
curl -X PATCH 'http://localhost:4000/api/v1/todos/42' \
  -H 'Authorization: Bearer ak_…' \
  -H 'Content-Type: application/json' \
  -d '{"done":true}'
```

```json
{ "todo": { "id": 42, "name": "File invoices", "done": true, "…": "…" } }
```

## Configuration

| Variable            | Effect                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `API_PUBLIC_ORIGIN` | Base URL used in `statusUrl` / `websocketUrl`. Set this in production so a spoofed `Host` cannot change returned links. Without it the request's protocol/host is used as a local fallback. |
| `API_CORS_ORIGINS`  | Comma-separated browser origins allowed to call the API. `*` explicitly allows any origin. With no allowlist the API stays same-origin. |

## Operational notes

- `apiRequests` rows are written per invocation and currently have **no automatic
  retention or cleanup**. Add a scheduled delete (for example, keep 90 days) before
  running a high-volume deployment.
- There is no built-in rate limiting or idempotency key. A retry of the same
  invoke request queues another run. Put rate limiting in front of the API and use
  `requestId` to correlate responses until an idempotency mechanism lands.

## Extending the API

`createApiRouter` accepts extra HTTP and WebSocket routes:

```ts
const router = createApiRouter({
  runtime,
  routes: [
    {
      method: "GET",
      path: "/api/custom/:id",
      handle({ params }) {
        // ...
      },
    },
  ],
  upgradeRoutes: [],
});
```

The backend passes one `ApiRuntime` with `queueFlow`, `uploadFiles` and
`onRunEvent`. New routes share the same auth helpers (`authenticateEndpoint`)
and response utilities.
