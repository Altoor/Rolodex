# Turborepo Tailwind CSS starter

This Turborepo starter is maintained by the Turborepo core team.

## Using this example

Run the following command:

```sh
npx create-turbo@latest -e with-tailwind
```

## Files workspace

Files live in a shared `files/` directory at the repository root. Set
`FILES_ROOT` to an absolute path to use a different location; the backend
creates it on startup. In Docker the backend always uses `/app/files`; point
the host side at another folder or volume with `ROLODEX_FILES_DIR` (for Unraid,
see `unraid.env.example`). Uploads and tool-created entries are indexed in the
`fileEntries` table, and the web app at `/files` browses that index.

### Private and root folders

A folder can be marked **Private** by its owner from the file metadata editor.
Only that user can see the folder or anything below it through GraphQL, file
tools, downloads, uploads, or live updates. Other users' task flows cannot
search or resolve it. Privacy is inherited through the path, so moving a folder
into or out of a private tree updates its descendants automatically.

A folder can also be marked **Root**. There is at most one root folder: marking
a folder as Root clears the previous root. When a root exists, `find_file`,
`find_files`, `find_folder`, and `find_folders` treat it as the workspace root
and only search inside its subtree. With no root folder they search the whole
accessible tree. Explicit ids and paths in tool state still work, subject to the
private-folder check.

`create_file` and `create_folder` use the same root folder as their default
destination. With a root they create inside it; with no root they use the
files-tree root.

### Indexing

Run a manual sync at any time:

```sh
pnpm files:index
pnpm files:index --path invoices --preview
pnpm files:index --include-unchanged --hash always
```

The same engine powers the **Refresh** button and the `scan_files` tool. Scans
skip `.tmp/`, `.gitkeep`, common system files, and symlinks. They abort above
5,000 disk entries (`--max-entries`), and `hash: "auto"` skips hashing files
larger than 100 MB. Set the tool's `scope` to `uploaded` to return only the
files uploaded or attached to the current run.

Embeddings are best-effort metadata. If Ollama is unavailable the file
operation still succeeds; repair missing vectors later with:

```sh
pnpm files:backfill-embeddings
```

### Live updates

The backend publishes file changes through the `fileEntryEvent` GraphQL
subscription (SSE). The `/files` page subscribes and debounces refetches by
250 ms, so uploads, edits, deletes, and indexing appear without pressing
**Refresh**. Selection and expanded folders are preserved because they are
keyed by entry id. **Refresh** remains available as a manual fallback if the
subscription drops.

### Upload limits

- `POST /files/upload` streams one file per request (default limit 10 GiB,
  configurable with `MAX_STREAM_UPLOAD_BYTES`) and requires a bearer token.
  This is the primary upload path.
- GraphQL `uploadFiles` is the small-file fallback: 25 MB total request,
  25 MB per file, 20 files per request.
- Text previews are capped at 5 MB; larger files are download-only.

### Security

- Every file GraphQL query/mutation requires authentication.
- Downloads use short-lived signed view tokens (5 minutes), not bare paths.
- Paths are normalized to POSIX and checked against `FILES_ROOT`; real-path
  checks reject symlink escapes. Unexpected errors are logged server-side and
  returned without absolute paths.
- Browser auth tokens expire after 7 days by default
  (`AUTH_TOKEN_TTL_SECONDS`).
- Private folders and their descendants are filtered from GraphQL, search,
  scans, downloads, uploads, and live updates for every other user.

## Assisted runs

Enable **Auto improvement** on `/user` to let local models help you start and
improve runs. The toggle is stored per user in `userSettings.autoImprovement`
and is off by default; while it is off, the landing page and task queue behave
exactly as before.

When enabled, a run started from the landing composer or the task-queue
assistant is an **assisted run**:

- The first step always pauses for review. The review shows the model's output
  and a trace of every prompt and response, and lets you accept it, describe a
  different outcome, replace the task, skip to the next task, or insert tasks
  before/after the step. Revisions run from the original checkpoint, never from
  the rejected attempt's effects.
- The task-queue assistant runs the **current unsaved builder draft**. Nothing
  is written to the saved task until you accept the reviewed step. The run
  records a transient snapshot instead.
- Decision steps ask "Is this the right choice?" You can accept the match, pick
  a different option for this run, optimize the wording (up to three model
  attempts), edit the wording yourself, or add an option. Assisted decisions
  below the **0.8 confidence floor** or with no match are parked until you pick
  an option explicitly. Decision premises are one or two words (the key the
  model answers under), and optimization/manual edits enforce that limit.
- If the chosen option has no next task, the run asks you to wire an existing
  task or draft a new tool task inline. The wiring is saved on the decision
  result, so later runs take the same branch.
- User-decision steps pause for the user as usual. While paused you can edit
  the prompt, labels, values, and targets; saving applies the edits to the run.
- Cancel discards the current trial and every uncommitted attempt, deletes
  draft tasks created only for the run, and leaves task/decision definitions at
  their last accepted state. There is no version history for accepted
  revisions.

### Sandbox and commit

Every tool step runs in an isolated trial:

- Database rows are cloned into a per-attempt Postgres schema, and `tools`
  route writes there through an `AsyncLocalStorage`-backed `db` proxy.
- The files tree is copied to `.trials/<runId>/<attemptId>/` and file tools use
  that root.
- Accept computes a scoped diff against the baseline and applies only the rows
  and files the attempt changed. Concurrent edits to the same row/path surface
  as a `CONFLICT` and leave the trial in place for a retry.
- Reject, cancel, and supersede discard the schema and files directory.
- Tools may set `trialSafe: false` when their effects cannot be rolled back;
  assisted runs reject those tools instead of presenting a false sandbox.

The trial workspace implementation lives in `packages/trial-workspace`; run
`pnpm --filter backend trials:cleanup` (also invoked at backend startup) to
remove schemas/directories left behind by a crashed process.

### Retention and traces

Trace events are scoped to the owning run and persist until the run or its
queued task is deleted. The trace accordion loads history and subscribes to
`assistedTraceEvent` for new events; the run itself is no longer polled. The
run list also exposes finished/cancelled/failed assisted runs under **Browse
run history**.

Assisted runs execute one step at a time, including `foreach` children, even
when the task allows parallelism. Standard runs keep their normal parallel and
auto-commit behaviour.

## Parallel task execution

Every task has a **Can run in parallel** setting in the task builder. It
defaults to off for `decision`/`textPrompt` tasks and for tools that can call
Ollama, Whisper, vision/OCR, or embeddings. Deterministic tools and user
decisions default to on. The queue runs parallel-capable steps first, executes
them up to the configured limit, and runs a non-parallel step only when nothing
else is in flight.

Every task also has a **Prioritize** setting. A prioritized step jumps to the
top of the queue ahead of older non-prioritized steps, whether or not it can run
in parallel. If a prioritized task is non-parallel, the queue stops starting new
parallel work, lets the in-flight steps drain, then runs the prioritized task
alone. Ordering is prioritize, then parallel-capable, then oldest first.

## Service settings

The `/settings` page stores installation-wide endpoints in the singleton
`appSettings` table:

- **Ollama API URL** — used by prompts, embeddings, decision models, and model
  management. This can point at a remote Ollama instance.
- **Whisper backend** — `faster_whisper` (OpenAI-compatible
  `/v1/audio/transcriptions`) or `whisper_cpp` (`/asr`).
- **Whisper API URL** — the full transcription endpoint.
- **Whisper model** — optional HuggingFace CTranslate2 model id sent with
  faster-whisper requests, for example
  `Systran/faster-whisper-large-v3` or
  `deepdml/faster-whisper-large-v3-turbo-ct2`.
- **Maximum parallel tasks** — how many parallel-capable queue steps may run
  at once. Allowed range 1–50, default 5.
- **Ollama keep-alive** — optional `keep_alive` sent with Ollama requests, for
  example `30m` or `1h`. Leave it empty to use the Ollama server's own
  `OLLAMA_KEEP_ALIVE`; the bundled compose files set 30m, and the app does not
  override that unless this field is filled in. `-1` keeps models loaded until
  Ollama needs the memory.
- **Preload models before they run** — on by default. When a queued step needs
  a model, the backend asks Ollama to load it while earlier work finishes.
- **Preload configured models on startup** — off by default. Warms the users'
  configured generation, decision, and vision models plus the embedding model
  once after startup. Keep it off on shared hosts or when VRAM is limited.

`read_audio_file` accepts `transcribe: true` to send the file to that endpoint.
By default the run's user state is sent as transcription context too; set
`includeState: false` to omit it. The Settings page requires an authenticated
user. If the table is empty, the backend falls back to `OLLAMA_BASE_URL`,
`WHISPER_BACKEND`, `WHISPER_API_URL`, and `WHISPER_MODEL`.

### Vision and OCR

`read_image_file` supports `describe: true`, `ocr: true`, or a custom `prompt`.
`describe` writes a `description` string, `ocr` writes an `ocr` string, and
setting both makes two vision calls so later tools can reference the fields
separately. The model comes from the user's **Vision model** setting on `/user`,
then the `VISION_MODEL` environment variable. There is no built-in text-only
fallback: if neither is configured, the tool reports a clear warning and still
returns the image metadata and preview URL. Vision errors never fail the task,
and image bytes only enter toolState when `includeBase64: true`.

The run's user state is included in the vision prompt by default, so instructions
such as “These are from Aamans Grønne køkken. Write the book name and page number
in the description.” reach the vision model. Set `includeState: false` on the
`read_image_file` task to use only the image and the tool's own prompt.

Ollama loads models lazily, and a cold large vision model can take longer than
the inference timeout. The backend therefore preloads the vision model as soon
as an image task is queued (and while the queue is waiting), then waits for the
load separately before starting the 120s inference timer. The load budget is
controlled by `MODEL_LOAD_TIMEOUT_MS` (default 300000) and the inference budget
by `VISION_TIMEOUT_MS` (default 120000). Warmup is deduplicated per model, so
description and OCR share one load, and a failed warmup is only logged.

### Tool config templates

Every tool config string can reference earlier toolState with `{{path}}`, for
example `{{content}}` or `{{file.name}}`. Templates are resolved after the
normal config/state/toolState merge, including strings nested inside objects and
arrays, and a missing path fails the task instead of being sent literally. A
value that is exactly one placeholder keeps the native type from toolState, so
`"{{folder.id}}"` resolves to a number and `"{{matched}}"` to a boolean. This
allows deterministic composition without a model call:

```json
{ "description": "{{description}}\n\n{{ocr}}" }
```

In the task builder, schema-driven controls above the JSON editor cover
booleans, enums, numeric limits, model choices, and path fields. Matching
`{{path}}` tokens are highlighted, and dropping a path badge inside a JSON
string inserts it as a template.

### Rule-based branching

The `switch` tool continues on the first matching ordered condition, or on its
default target. Each case is a separate output handle on the task flow, and
targets can be wired by dragging from that handle. `switch` is deterministic;
the `decision` task asks the configured decision model instead. See
`packages/tools/README.md` for an example config.

Decision tasks can optionally add accumulated tool state to the state sent to
the decision model. In the task builder, **Decision model context** offers
**None**, **All tool state**, or **Selected paths** (for example `file.path` or
`files.0.name`). This only changes the decision model prompt; the run's state
and tool state passed to later tasks are unchanged.

Generated choice results start with a probability threshold of `0.8`. New result
rows added in the draft editor use the same default; the threshold remains
editable per result.

### Task flow layout

The task-flow chart places each task in a left-to-right column. A single chain
runs straight to the right, and branches fan out vertically from their parent.
The canvas can zoom out to 10% and uses the full window width on large displays.

### Importing and exporting tasks

The task-flow toolbar has **Export** and **Import** buttons. Export downloads
every task with its results, user-decision options, tool/model settings, and the
decisions those tasks reference. The file is versioned JSON:

```json
{
  "format": "rolodex-tasks",
  "version": 1,
  "exportedAt": "2026-11-19T00:00:00.000Z",
  "decisions": [],
  "tasks": []
}
```

Import recreates everything from the file and remaps all task references
(`fallbackTaskId`, `onTrueTaskId`, `onFalseTaskId`, switch targets, result
targets, and user-decision option targets) to the new IDs. Import is additive:
existing tasks are never changed or deleted, so importing the same file twice
creates another set of copies. References to tasks missing from the file are
cleared with a warning in the import result.

### Selecting, copying and pasting tasks

Drag on empty canvas space to draw a selection box around tasks (partially
covered tasks are included). Hold Shift, Cmd, or Ctrl while clicking to add or
remove tasks from the selection.

- Press Delete or Backspace to delete the selected tasks after one confirmation.
- Right-click a selected task to **Copy**, **Export**, or **Delete** the
  selection. The same menu works for a single task.
- Use Ctrl/Cmd+C and Ctrl/Cmd+V to copy and paste the selection. Right-clicking
  empty canvas space offers **Paste tasks** as well.

Copy and paste uses the task export format. Pasted tasks get new IDs, internal
links between copied tasks are remapped, and links to tasks outside the
selection keep pointing at the existing tasks. Decisions referenced by copied
tasks are reused instead of duplicated. Pasted tasks appear near the paste
location or in the center of the canvas for keyboard paste.

### Task output blocks

Tool results are rendered by the UI block registry. File-shaped outputs
(`read_*`, `scan_files`, created/updated entries, and arrays) show compact cards
with preview and download actions. `display_block` can force this with
`"block": "file"`. Unrecognised outputs still fall back to the raw JSON block.

## API origin

File uploads, downloads, media previews, and GraphQL all use one backend
origin. Set `API_PUBLIC_ORIGIN` when the API is not reachable at
`http://<web-host>:4000`, for example:

```sh
# apps/web/.env.local
API_PUBLIC_ORIGIN=http://localhost:5454
```

The web server reads this at runtime, injects it into the page, and the browser
uses it for every backend request. The web bundle does not bake the origin in at
build time, so changing the public URL does not require rebuilding. Recreate
**both** the web and backend containers, because the backend also uses the value
for outward REST `statusUrl` and `websocketUrl` links. Trailing slashes are
ignored. With Docker, set `API_PUBLIC_ORIGIN` in `.env`; the compose files pass
it to both the web and backend containers.

> Migrating from an older checkout: rename `NEXT_PUBLIC_API_ORIGIN` to
> `API_PUBLIC_ORIGIN`. The old `NEXT_PUBLIC_*` variable is no longer read, so a
> split-origin deployment that keeps only the old name will silently fall back
> to the browser-derived origin.

Without the variable the browser keeps the API on port 4000 on the same host
as the web app. When the web app is served on port 80 or 443, it instead uses
its own origin, which suits a reverse proxy in front of both apps. Server
rendering falls back to `http://localhost:4000`.

The same value also configures the outward REST API:

- `API_PUBLIC_ORIGIN` sets the base URL returned in `statusUrl` and
  `websocketUrl`, so a spoofed `Host` cannot change those links.
- `API_CORS_ORIGINS` is a comma-separated allowlist of browser origins. `*`
  explicitly allows any origin; without it the outward API stays same-origin.

See `packages/api/README.md` for authentication, limits and operational notes.

## Docker Compose

Four standalone compose files are available. All of them include PostgreSQL,
the backend, and the web app; the backend applies schema changes with
`drizzle-kit push --force` on startup. In a local checkout, run
`pnpm --filter backend push` after pulling a schema change.

```sh
# Frontend + backend (+ PostgreSQL)
docker compose -f compose.app.yml up --build

# Add a local Ollama container
docker compose -f compose.ollama.yml up --build

# Add a faster-whisper container
docker compose -f compose.whisper.yml up --build

# Add both
docker compose -f compose.full.yml up --build
```

The web app is served at `http://localhost:3001` and the API at
`http://localhost:4000`. The files workspace is mounted into the backend at
`/app/files` from `${ROLODEX_FILES_DIR:-./files}`; set `ROLODEX_FILES_DIR` in
`.env` to keep the workspace on another disk or share. Compose reads `.env`;
`TOKEN_SECRET` is required. Database URLs inside the containers use the
`postgres` service hostname.

The bundled Whisper service is [Speaches](https://github.com/speaches-ai/speaches)
(`ghcr.io/speaches-ai/speaches:latest-cpu`), an OpenAI-compatible
faster-whisper server. `WHISPER_MODEL` accepts a HuggingFace CTranslate2 model id
and is downloaded into the shared cache before the backend starts; the default
is `Systran/faster-whisper-large-v3`. If you use a different model on
`/settings`, set `WHISPER_MODEL` in `.env` to that id so it is downloaded too.
To use an NVIDIA GPU, set
`WHISPER_IMAGE=ghcr.io/speaches-ai/speaches:latest-cuda` in `.env`, optionally
with `WHISPER_COMPUTE_TYPE=float16`. The model cache lives in the
`whisper_data` volume. The Ollama service keeps the WSL2 `/dev/dxg` passthrough
from the original `compose.yml`; remove those entries on a native Linux host.

## Unraid (published images)

`.github/workflows/publish-images.yml` publishes two `linux/amd64` images to the
GitHub Container Registry on every push to `main`, on `v*` tags, and on manual
dispatch:

- `ghcr.io/<owner>/rolodex-backend`
- `ghcr.io/<owner>/rolodex-web`

Builds are tagged with the commit (`sha-…`), the git/semver tag when present,
and `latest` on the default branch. `compose.unraid.yml` pulls these images, so
the Unraid host only needs Docker and Compose Manager Plus, not this repository
or a build toolchain.

1. **Publish the images.** Merge to `main`, or open **Actions → Publish images →
   Run workflow** and pick a branch. The manual run publishes `sha-…` tags only
   outside the default branch.

2. **Let Unraid pull the images.** GHCR packages are private by default. Either
   set both packages to public in their GitHub package settings, or create a
   classic PAT with `read:packages` and log in:

   ```sh
   echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
   ```

   `/root` on Unraid is temporary, so repeat the login after a reboot, or make
   the packages public.

3. **Create the stack.** In Compose Manager Plus, create a stack and paste the
   contents of `compose.unraid.yml` into the stack's `compose.yml` (or rename it
   to a standard name: `compose.yaml`, `compose.yml`, `docker-compose.yaml`, or
   `docker-compose.yml`). Compose Manager Plus does not auto-discover
   `compose.unraid.yml`. Copy `unraid.env.example` to `.env` beside it, fill in
   the secrets, and set `ROLODEX_IMAGE_PREFIX=ghcr.io/<owner>`. Use hex values
   for `POSTGRES_PASSWORD` (`openssl rand -hex 16`) and `TOKEN_SECRET`
   (`openssl rand -hex 32`).

4. **Create the data directories.** Postgres runs as UID/GID `999`:

   ```sh
   mkdir -p /mnt/user/appdata/rolodex/{pgdata,ollama}
   mkdir -p /mnt/user/files/rolodex
   chown -R 999:999 /mnt/user/appdata/rolodex/pgdata
   ```

   `ROLODEX_DATA_DIR` holds Postgres and Ollama data; `ROLODEX_FILES_DIR` is the
   files workspace and can point at any array/cache share. Both are required, so
   a missing value fails the stack instead of writing to the USB flash under
   `/boot`.

5. **Expose it on the tailnet only.** Keep `ROLODEX_BIND_ADDR=127.0.0.1` and
   start the stack. Enable HTTPS certificates for the tailnet in the Tailscale
   admin console, then publish both ports with Tailscale Serve:

   ```sh
   tailscale serve --bg --https=443  http://127.0.0.1:3001
   tailscale serve --bg --https=8443 http://127.0.0.1:4000
   ```

   Set `API_PUBLIC_ORIGIN=https://<host>.<tailnet>.ts.net:8443` and
   `API_CORS_ORIGINS=https://<host>.<tailnet>.ts.net`, then open
   `https://<host>.<tailnet>.ts.net/` from a tailnet device.

For direct tailnet access without Serve, set `ROLODEX_BIND_ADDR=0.0.0.0` and:

```sh
API_PUBLIC_ORIGIN=http://<host>:4000
API_CORS_ORIGINS=http://<host>:3001
```

Do not port-forward either port on the router.

The bundled Ollama container is behind the `ollama` Compose profile. The example
`.env` enables it with `COMPOSE_PROFILES=ollama`; remove that line to skip it and
point `OLLAMA_BASE_URL` at an existing Ollama server instead.

### Updating

```sh
docker compose pull
docker compose up -d
```

`latest` follows `main`. Pin `ROLODEX_TAG=sha-…` or a version tag for
reproducible deployments; changing the tag is also the rollback path. The
backend applies schema changes with `drizzle-kit push --force` on startup, so
take a Postgres backup before updating:

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > rolodex-backup.sql
```

Changing `API_PUBLIC_ORIGIN` needs both the web and backend containers
recreated (the backend uses it for outward REST links); the web bundle itself is
deployment-agnostic. The web service waits for the backend health endpoint, which
only answers after the startup `drizzle-kit push` has finished, so the first page
load cannot race the schema update.

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app with [Tailwind CSS](https://tailwindcss.com/)
- `web`: another [Next.js](https://nextjs.org/) app with [Tailwind CSS](https://tailwindcss.com/)
- `ui`: a stub React component library with [Tailwind CSS](https://tailwindcss.com/) shared by both `web` and `docs` applications
- `@repo/tailwind-config`: shared Tailwind CSS theme and PostCSS configuration
- `@repo/eslint-config`: `eslint` flat configurations (includes `@next/eslint-plugin-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Building packages/ui

This example is set up to produce compiled styles for `ui` components into the `dist` directory. The component `.tsx` files are consumed by the Next.js apps directly using `transpilePackages` in `next.config.ts`. This was chosen for several reasons:

- Make sharing one theme from `packages/tailwind-config/shared-styles.css` to apps and packages as easy as possible.
- Make package compilation simple by only depending on the Next.js Compiler and `tailwindcss`.
- Ensure Tailwind classes do not overwrite each other. The `ui` package uses a `ui-` prefix for its classes via `@import "tailwindcss" prefix(ui);` in [packages/ui/src/styles.css](packages/ui/src/styles.css).
- Maintain clear package export boundaries.

Another option is to consume `packages/ui` directly from source without building. Tailwind CSS v4 automatically detects class names in your source files, but it does not scan other packages in `node_modules`. If you use this option, add [`@source` directives](https://tailwindcss.com/docs/functions-and-directives#source-directive) to the CSS entry point in your apps so Tailwind can find the class names used in the `ui` package:

```css
@import "tailwindcss";
@import "@repo/tailwind-config";

@source "../../../packages/ui/src";
```

If you choose this strategy, you can remove the `tailwindcss` dependency and the `build:styles` script from the `ui` package.

### Utilities

This Turborepo has some additional tools already setup for you:

- [Tailwind CSS](https://tailwindcss.com/) for styles
- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting
