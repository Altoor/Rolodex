# Plan: preload Ollama models before vision/OCR use

## Problem

Image description and OCR frequently fail with:

```
warning: "Vision failed: ocr: vision request timed out after 120s"
```

The image metadata read still succeeds, so the failure is a soft warning, but
OCR and descriptions are silently lost.

## Root cause

- Ollama loads models lazily on the first request. The load time is part of that
  request, and a cold large vision model can easily take more than 120 seconds
  on CPU or a busy GPU.
- `packages/tools/src/tools/file/services/vision.ts` wraps the whole
  `client.generate(...)` call in a fixed `DEFAULT_TIMEOUT_MS = 120_000`. That
  budget covers **model load + inference**, so a slow load looks like a failed
  inference.
- Vision description and OCR are requested concurrently via
  `Promise.allSettled`. When the model is cold, both requests race the same
  load.
- No `keep_alive` is sent, so Ollama unloads the model after its default idle
  period (5 minutes). Every run after that gap pays the cold-start cost again.
- There is no warmup/preload path anywhere in the app, even though the queue
  usually knows which model a task will need before it runs.

## Goals

- Remove cold-start timeouts from `read_image_file` description/OCR.
- Load a model into memory shortly **before** it is used, as preferred.
- Keep the model resident long enough to serve the current run.
- Make the per-request timeout measure inference only, never model loading.
- Do not block or fail the queue when a warmup attempt fails.
- Keep the fix reusable for generation, decision, and embedding models.

## Non-goals

- Changing the vision model itself or adding a new OCR engine.
- Preloading the Whisper HTTP backend. `read_audio_file` has the same
  first-request timeout pattern, but it is not Ollama and has no standard
  warmup endpoint. Track it as a follow-up.

## Proposed solution

### 1. Add a warmup service in `packages/ai`

New file `packages/ai/src/warmup.ts`:

```ts
export interface WarmupOptions {
  keepAlive?: string | number;
  timeoutMs?: number;
}

/** Loads a model and waits until Ollama reports the request finished. */
export function ensureModelLoaded(
  model: string,
  options?: WarmupOptions,
): Promise<void>;

/** Fire-and-forget wrapper; logs failures instead of throwing. */
export function warmModelInBackground(
  model: string,
  options?: WarmupOptions,
): void;

/** Clears the in-process warm/dedupe state, e.g. after settings change. */
export function resetModelWarmupCache(): void;
```

Implementation notes:

- Key the cache by `baseUrl + model`, because the Ollama endpoint can change at
  runtime.
- Deduplicate concurrent warmups with a `Map<string, Promise<void>>`. Five
  parallel image steps must produce one load, not five.
- Track a small "recently warmed" timestamp per key (TTL below the configured
  `keep_alive`) and skip redundant requests.
- Prefer `client.ps()` to detect an already-loaded model and its `expires_at`.
  If it is loaded and has meaningful time left, return immediately.
- Warm with a load-only request, for example
  `client.generate({ model, prompt: "", stream: false, keep_alive, options: { num_predict: 1 } })`.
  The empty prompt asks Ollama to load the model; `num_predict: 1` keeps any
  accidental generation tiny. Wrap it in a **model-load** timeout that is
  deliberately longer than the inference timeout.
- Export `DEFAULT_OLLAMA_KEEP_ALIVE` (initially `"10m"`).

Export it from `packages/ai/src/index.ts`.

### 2. Trigger warmup a little before use

Add `apps/backend/src/queue/model-warmup.ts` that maps a queued step to the
models it will need, then calls `warmModelInBackground`:

- `decision` task → decision model
  (`row.decisionModel ?? task.decisionModel ?? getDecisionModelForUser`).
- `userDecision` task → none.
- `tool` task → models declared by the tool. Add a `modelRoles` field to
  `ToolDefinition` in `packages/tools/src/model/tool.ts`:
  - `read_image_file` → `["vision"]`
  - `prompt` → `["generation"]`
  - `find_file`, `find_files`, `find_folder`, `find_folders` →
    `["decision", "embedding"]`
  - `find_todo`, `find_todos` → `["decision", "embedding"]`
  - todo/file mutations that write embeddings → `["embedding"]`
  - `read_audio_file`, deterministic tools → none
- Resolve `vision` with `getVisionModelForUser`, `generation` with
  `getModelForUser`, `decision` with `getDecisionModelForUser`, and
  `embedding` with `EMBEDDING_MODEL`.
- Deduplicate the resulting model names before warming.

Hook it in three places:

1. **On enqueue** — after `enqueueStep` / `enqueueSteps` insert rows, warm the
   models for the new steps in the background. This covers chains, foreach
   fan-out (for example five `read_image_file` children queued at once), and
   user-initiated runs that wait behind other work.
2. **Queue head** — while the processor is waiting for running work to drain or
   for a parallel slot, warm the models of the next queued step. The queue
   already knows what is next, so this gives the model load a head start.
3. **On startup (optional)** — if `warmModelsOnStartup` is enabled, warm the
   configured vision/generation/decision models once after
   `resetStaleRunningTasks`. Keep this off by default to avoid surprising VRAM
   use.

All of these triggers are best-effort: catch and `console.warn` failures.

### 3. Separate load time from inference time

In `packages/tools/src/tools/file/services/vision.ts`:

- Resolve the model and read the image buffer once in `describeImageTexts`, not
  once per request.
- Before starting the inference timer, call
  `await ensureModelLoaded(model, { timeoutMs: modelLoadTimeoutMs })`.
  Because warmup is deduplicated, description and OCR share it.
- Start the existing 120s inference timeout only after warmup resolves.
- Pass `keep_alive` on the actual `client.generate` call too, so the model stays
  resident between description and OCR and between close-together steps.
- Make the timeouts configurable:
  - `VISION_TIMEOUT_MS` (default `120000`) for inference.
  - `MODEL_LOAD_TIMEOUT_MS` (default `300000`) for loading/warmup.
- Keep error messages distinct: `vision model "…" failed to load` versus
  `vision request timed out after …s`.

If warmup fails, log it and still attempt inference; the existing warning path
remains the final fallback.

### 4. Send `keep_alive` on every Ollama call

Pass the configured keep-alive value in:

- vision `generate`
- prompt `generate` (`packages/tools/src/tools/prompt/prompt/runPrompt.ts`)
- decision `systemone` (`apps/backend/src/queue/processors/decision-step.ts`
  and the other `systemone` call sites)
- embeddings (`packages/ai/src/embeddings.ts`)
- `packages/ai/src/ollama.ts` helper exports, if it is cleaner to centralize

This prevents Ollama from unloading the model between steps of the same run.

### 5. Settings, observability, and manual warmup

- Add `appSettings.ollamaKeepAlive` (text, default `"10m"`; accept `-1`, `0`,
  or durations such as `5m`).
- Add `appSettings.preloadModels` (boolean, default `true`) as a master switch
  for enqueue/queue-head warmups.
- Add `appSettings.warmModelsOnStartup` (boolean, default `false`).
- Expose the fields through GraphQL, `packages/queries`, and the `/settings`
  page, with validation. Changing the keep-alive or Ollama URL resets the
  warmup cache.
- Log warmup start/finish with model, duration, and whether it was already
  loaded. This makes the fix observable and makes future timeout reports
  diagnosable.
- Optional: add a `warmModel(name)` mutation and a "Load now" button on the
  model/settings page, using `client.ps()` to show loaded state.

## Work items

| #   | Item                                                                                | Depends on |
| --- | ----------------------------------------------------------------------------------- | ---------- |
| 1   | Add `packages/ai/src/warmup.ts` with dedupe, `ps()` check, keep-alive, and timeouts | —          |
| 2   | Split vision load/inference timeouts and await `ensureModelLoaded` before inference | 1          |
| 3   | Add `modelRoles` metadata to tool definitions                                       | —          |
| 4   | Add `apps/backend/src/queue/model-warmup.ts` and resolve models per task/user       | 1, 3       |
| 5   | Warm on enqueue and on queue-head while the processor is waiting                    | 4          |
| 6   | Pass `keep_alive` through vision, prompt, decision, and embedding calls             | 1          |
| 7   | Add keep-alive/preload settings, GraphQL, queries, and `/settings` controls         | 1          |
| 8   | Optional startup warmup and manual "Load now" action                                | 4, 7       |
| 9   | Update README, regenerate GraphQL types, run type checks and lint                   | all        |

## Files likely touched

- `packages/ai/src/warmup.ts` (new), `packages/ai/src/index.ts`,
  `packages/ai/src/ollama.ts`, `packages/ai/src/embeddings.ts`
- `packages/tools/src/model/tool.ts`, tool definitions with model roles
- `packages/tools/src/tools/file/services/vision.ts`
- `packages/tools/src/tools/prompt/prompt/runPrompt.ts`
- `apps/backend/src/queue/model-warmup.ts` (new),
  `apps/backend/src/queue/processor.ts`,
  `apps/backend/src/queue/step-store.ts`
- `apps/backend/src/queue/processors/decision-step.ts` and other `systemone`
  call sites
- `packages/db/src/schema.ts`, `packages/db/src/app-settings.ts`,
  `apps/backend/src/schema/appSettings/*`
- `packages/queries/src/settings/*`, settings UI under `packages/ui/src`
- `apps/backend/drizzle/` (new migration)
- `README.md`

## Verification

1. Stop the model and confirm it is cold:
   `ollama stop <vision-model>` / `ollama ps` shows nothing.
2. Queue an image OCR task and watch logs: the warmup starts before the tool
   executes, `ollama ps` shows the model loaded, and the task completes without
   the 120s warning.
3. Run description + OCR together: exactly one warmup request is issued, and
   both outputs are returned.
4. Run several image tasks in a row: no reload between them while
   `keep_alive` is active.
5. Queue five image tasks with `maxParallelTasks > 1`: only one load per model.
6. Let the keep-alive window expire and confirm the next run warms again instead
   of timing out.
7. Stop Ollama or point the URL at an invalid host: the task still returns its
   metadata with a warning, and warmup failures are logged but do not fail the
   queue.
8. Verify `pnpm check-types` and `pnpm lint` pass.

## Risks and considerations

- Keeping several large models resident can exhaust VRAM. The keep-alive value
  and startup warmup are configurable; Ollama still evicts models when it needs
  space.
- Warming a remote Ollama instance may affect other clients. The preload master
  switch can disable it.
- An untracked in-flight warmup must never keep the queue loop alive or delay
  unrelated tasks.
- The existing 120s warning remains the correct behavior for genuine inference
  failures; only load time is removed from that budget.

## Follow-ups

- Apply the same warmup idea to the Whisper backend if it exposes a
  load/warmup endpoint.
- Consider selecting OCR and description sequentially when the same model is
  cold, to avoid two concurrent generations on a single loaded model.

## Implementation status

Implemented:

- `packages/ai/src/warmup.ts` with deduplicated warmups, `ps()` detection,
  model-name normalisation (`nomic-embed-text` → `nomic-embed-text:latest`),
  `MODEL_LOAD_TIMEOUT_MS`, and `warmModelInBackground`.
- `ToolDefinition.modelRoles`, with vision, generation, decision, and embedding
  roles declared on the tools that actually call those models.
- `apps/backend/src/queue/model-warmup.ts`, wired into `createQueuedTask`, the
  queue `enqueueStep`/`enqueueSteps` helpers, the queue wait loop, and optional
  startup warmup.
- Separate vision load/inference timeouts; one model/buffer resolution per
  description+OCR pair.
- `keep_alive` propagation for vision, generation, decisions, and embeddings.
- App settings, GraphQL, queries, and `/settings` controls for keep-alive and
  preloading, with a migration.
- README documentation.

**Compose compatibility:** `appSettings.ollamaKeepAlive` is nullable and unset
by default. When it is empty, the backend sends no `keep_alive` at all, so the
Ollama server's `OLLAMA_KEEP_ALIVE` (30m in the bundled compose files) remains in
effect. The app only overrides it when the field is explicitly filled in.
