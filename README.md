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
creates it on startup. Uploads and tool-created entries are indexed in the
`fileEntries` table, and the web app at `/files` browses that index.

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
larger than 100 MB.

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

## Service settings

The `/settings` page stores installation-wide endpoints in the singleton
`appSettings` table:

- **Ollama API URL** — used by prompts, embeddings, decision models, and model
  management. This can point at a remote Ollama instance.
- **Whisper backend** — `faster_whisper` (OpenAI-compatible
  `/v1/audio/transcriptions`) or `whisper_cpp` (`/asr`).
- **Whisper API URL** — the full transcription endpoint.
- **Whisper model** — optional model name sent with faster-whisper requests.

`read_audio_file` accepts `transcribe: true` to send the file to that endpoint.
The Settings page requires an authenticated user. If the table is empty, the
backend falls back to `OLLAMA_BASE_URL`, `WHISPER_BACKEND`, and
`WHISPER_API_URL`.

### Vision and OCR

`read_image_file` supports `describe: true`, `ocr: true`, or a custom `prompt`.
The model comes from the user's **Vision model** setting on `/user`, then the
`VISION_MODEL` environment variable. There is no built-in text-only fallback: if
neither is configured, the tool reports a clear warning and still returns the
image metadata and preview URL. Vision errors never fail the task, and image
bytes only enter toolState when `includeBase64: true`.

### Rule-based branching

The `switch` tool continues on the first matching ordered condition, or on its
default target. Each case is a separate output handle on the task flow, and
targets can be wired by dragging from that handle. `switch` is deterministic;
the `decision` task asks the configured decision model instead. See
`packages/tools/README.md` for an example config.

### Task output blocks

Tool results are rendered by the UI block registry. File-shaped outputs
(`read_*`, `scan_files`, created/updated entries, and arrays) show compact cards
with preview and download actions. `display_block` can force this with
`"block": "file"`. Unrecognised outputs still fall back to the raw JSON block.

## Docker Compose

Four standalone compose files are available. All of them include PostgreSQL,
the backend, and the web app; the backend applies schema changes with
`drizzle-kit push --force` on startup.

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
`http://localhost:4000`. The shared `files/` directory is mounted into the
backend. Compose reads `.env`; `TOKEN_SECRET` is required. Database URLs inside
the containers use the `postgres` service hostname.

The bundled Whisper image is `hwdsl2/whisper-server` (faster-whisper). Set
`WHISPER_IMAGE=hwdsl2/whisper-server:cuda` and `WHISPER_MODEL` in `.env` to use
an NVIDIA GPU. The Ollama service keeps the WSL2 `/dev/dxg` passthrough from the
original `compose.yml`; remove those entries on a native Linux host.

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
