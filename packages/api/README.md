# @repo/api

The outward-facing REST/WebSocket API. Endpoint administration lives in
GraphQL; this package owns the public request surface, authentication and flow
status read model.

## Endpoint model

Each API link stores:

- a random `slug` used in the URL
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
headers on a WebSocket handshake. Use TLS when exposing the API.

## Invoke

```sh
curl -X POST 'http://localhost:4000/api/hooks/<slug>' \
  -H 'Authorization: Bearer ak_…' \
  -H 'Content-Type: application/json' \
  -d '{"state":"Summarise this support ticket"}'
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

| Body | State |
|---|---|
| `application/json` | `stateField` value, a top-level `state` string, or the whole JSON body pretty-printed |
| `text/plain` | Raw text |
| `multipart/form-data` | `stateField`, then `state`/`message`/`prompt`/`text`, then all fields as JSON; files are attached |

Limits: 5 MiB for JSON/text, 20 files, 25 MiB per file.

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
    { "id": 1, "taskId": 2, "taskName": "…", "toolKey": "…",
      "status": "completed", "summary": "…", "note": null, "queuedAt": "…" }
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
