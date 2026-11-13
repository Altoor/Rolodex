# Rolodex follow-up plan

**Baseline:** Files stages 1–9 are implemented and verified. This plan covers the
selected follow-ups: lenient model dates, rule-based branching, OCR/vision, audio
transcription, real-time tree updates, and file blocks.

**Model defaults (done):**

- Generation: `gemma4:e4b` (`DEFAULT_MODEL`)
- Decision: `tev1:4b` (`DEFAULT_DECISION_MODEL`)
- Per-user settings still override the defaults.

**Working agreement:**

- One item per commit/PR. Each item ends with `pnpm lint`, `pnpm check-types`,
  and `pnpm build` for backend/UI changes.
- Keep tools deterministic unless the item explicitly calls a model.
- Update `README.md`, `packages/tools/README.md`, and this plan when an item
  ships.
- Do not break existing task runs, file entries, or `toolState` shapes.

---

## 1. Switch tool — rule-based branches ✅

**Goal:** Branch to different tasks using ordered conditions, like a `switch`
statement. It behaves like the decision task (one branch wins), but the branch is
chosen by `if`-style conditions instead of an LLM. Each case is its own output on
the task flow node.

**Implemented:** `switchTool.ts` and `validateSwitchConfig` reuse the `if`
condition language; the backend validates targets and clears deleted task
references; task results carry `branchLabel`; the task builder has a structured
case editor; and the flow renders stable case handles plus a Default handle.

**Config shape:**

```json
{
  "path": "todos",
  "quantifier": "some",
  "cases": [
    {
      "id": "has-open",
      "label": "has open todos",
      "when": { "eq": { "path": "done", "value": false } },
      "nextTaskId": 12
    },
    {
      "id": "has-todos",
      "label": "has todos",
      "when": { "has": { "path": "id" } },
      "nextTaskId": 13
    }
  ],
  "defaultTaskId": 14
}
```

**Tasks:**

1. Add `packages/tools/src/tools/switch/switchTool.ts` and register it as
   `switch` (`category: "ai"`, `inputMode: "json"`).
2. Reuse `validateWhereExpression` / `evaluateWhere` and the same
   `path` / `quantifier` semantics as the `if` tool. Cases are evaluated in
   order; the first match wins.
3. Return `nextTaskId` from the matching case, otherwise `defaultTaskId`.
   No match and no default stops the run with a clear note.
4. Extend `ToolExecution` with an optional `branchLabel` and surface it in the
   task result so the run view shows which case fired. Routing still uses
   `nextTaskId`.
5. Validate: at least one case, stable unique case `id`, unique non-empty
   labels, positive integer targets, valid `when` expressions. Warn when an
   empty condition is used before other cases.
6. **Task flow output per case:** render one source handle per switch case on
   the task flow node, plus a separate optional Default handle. Label each
   handle with its case label and use a stable handle id (`switch:<caseId>`),
   not the array index. Dragging from a case handle writes that case's
   `nextTaskId`; the Default handle writes `defaultTaskId`. Update
   `taskFlowTypes.ts`, `taskFlowNodeHandles.tsx`, `edges.ts`, `connection.ts`,
   and the flow actions so reordering or deleting a case removes/updates its
   edge instead of leaving a stale connection.
7. Task builder: add a switch editor with case label, condition (reuse the
   existing JSON condition editor if no visual builder exists), and target task
   picker. Hide deleted tasks from pickers, and keep the flow handles in sync
   with the case list.
8. When a task is deleted, clear references to it from `switch` configs.
9. Document an example flow and the difference from `decision`:
   `switch` is deterministic; `decision` asks the configured decision model.

**Done when:**

- Every switch case appears as its own output handle and can be wired to a
  different task; the Default handle is separate.
- A three-case flow plus default routes correctly, including no-match.
- Reordering or deleting a case updates the flow without stale edges.
- Invalid configs fail with `ToolInputError`, never a stack trace.
- Types/lint/build pass.

---

## 2. OCR and vision support ✅

**Goal:** Let `read_image_file` describe or OCR images.

**Implemented:** `getVisionModelForUser` resolves the per-user setting then
`VISION_MODEL`; `describeImageFile` calls Ollama with a timeout; `read_image_file`
adds `describe`, `ocr`, `prompt`, and `maxBytes` inputs and returns vision text or
a non-fatal `warning`. The user settings page exposes the vision model.

**Tasks:**

1. Add a vision model setting: `VISION_MODEL` env plus an optional per-user
   `defaultVisionModelName` (fallback: env, then a clear "not configured"
   error). Do not silently use the generation model unless it is vision-capable.
2. Add `read_image_file` inputs: `describe`, `ocr`, `prompt`, and a byte guard.
   Send base64 images to Ollama and return
   `{ model, text, kind: "description" | "ocr" }`.
3. Timeouts and failures must not block metadata reads; return a warning field
   instead of throwing when vision fails.
4. Document required models and add a settings field in the UI.
5. Add tests/fixtures for a text image and a photo.

**Done when:**

- Image OCR and description return text with model provenance.
- Vision failures are reported without breaking metadata reads.
- No image bytes are written into toolState unless explicitly requested.

---

## 3. Audio transcription ✅

**Goal:** `read_audio_file` can return a transcript in addition to metadata and a
preview URL.

**Implemented:**

- Transcription goes through an HTTP Whisper service instead of a local binary,
  so the backend does not need ffmpeg, Python, or a model on disk.
- The service is configured on `/settings`:
  - **Whisper backend** — `faster_whisper` (OpenAI-compatible
    `/v1/audio/transcriptions`) or `whisper_cpp` (`/asr`).
  - **Whisper API URL** — full endpoint, for example
    `http://127.0.0.1:9000/v1/audio/transcriptions`.
  - **Whisper model** — optional, sent with faster-whisper requests.
- `packages/tools/src/tools/file/services/transcribe.ts` builds the multipart
  request per backend, enforces a 25 MB / 120 s guard, and normalizes the
  response into `{ text, language, duration, segments, backend, model }`.
- `read_audio_file` accepts `transcribe`, `language`, `model`, and `maxBytes`.
  When `transcribe` is false it behaves exactly as before.
- `WHISPER_BACKEND`, `WHISPER_API_URL`, and `WHISPER_MODEL` act as environment
  defaults when the settings row is empty.
- The bundled Whisper compose service uses `hwdsl2/whisper-server`
  (faster-whisper, OpenAI-compatible) at
  `http://whisper:9000/v1/audio/transcriptions`.

**Done when:**

- Short audio files transcribe through the configured service; missing config
  returns a clear error without crashing the task.
- Both request shapes are exercised by the compose variants.
- Types/lint/build pass.

---

## 4. Real-time file tree updates ✅

**Goal:** The files page reflects uploads, edits, deletes, and indexing without a
manual Refresh.

**Implemented:** `fileEvents` emits from create/upload/update/delete/write/index
paths; the authenticated `fileEntryEvent` subscription streams over SSE; the
files page debounces refetches by 250 ms, preserves selection/expansion, and
shows a small live-update notice. Refresh remains the manual fallback.

**Tasks:**

1. Add a `fileEvents` emitter in the backend (same pattern as `queueEvents`).
2. Emit events from file mutations, uploads, and indexing:
   `{ type, id?, parentId?, path? }`.
3. Add an authenticated `fileEntryEvent` GraphQL subscription using the existing
   SSE transport.
4. Subscribe on the files page, debounce refetches (~250 ms), and preserve the
   selected entry/expanded folders.
5. Show a small toast for events caused by indexing or another session.
6. Add a fallback poll or manual Refresh message if the subscription drops.

**Done when:**

- Upload/edit/delete appear without a page reload.
- A dropped connection does not break the tree or leak events between users.
- Types/lint/build pass.

---

## 5. File blocks in task output ✅

**Goal:** File-shaped tool results render as compact cards with preview/download
actions instead of raw JSON.

**Implemented:** the `file` block extracts `FileEntryRef` objects from single
outputs and arrays, renders type icon/name/path/size/description, and uses the
existing lazy view token for preview and download. It is registered for
automatic matching and for `display_block` with `block: "file"`.

**Tasks:**

1. Add a `FileBlock` (and `FileListBlock` for arrays) to
   `packages/ui/src/components/blocks`.
2. Match only outputs that have both a numeric `id` and a `name` (plus
   `path`/`relativePath`, `fileType`, `mimeType`, `size` where present) to avoid
   false positives.
3. Render icon by type, name, path, size, and description. Actions: Preview and
   Download, using lazy `createFileViewToken`.
4. Register the block and let `display_block` force it with `block: "file"`.
5. Reuse the existing preview components/dialog used by `/files`.
6. Cover file reads, scan results, created/updated entries, and arrays.

**Done when:**

- `read_*`, `scan_files`, and `display_block` outputs render as cards.
- Non-file outputs still fall back to the raw block.
- Types/lint/build pass.

---

## 6. Lenient dates from model output ✅

**Goal:** When a generative model supplies an unparseable date, do not fail the
task. Treat the value as "no date supplied" and continue.

**Implemented:** `parseTodoDateTimeLenient` and `todoDateWarning` power
`create_todo`/`update_todo`; invalid dates store no date on create, leave the
existing date on update, and emit a `warnings` entry plus a server log line.

**Tasks:**

1. Add a non-throwing parser in
   `packages/tools/src/tools/todo/services/date.ts`, for example
   `parseTodoDateTimeLenient`, returning
   `{ date: Date | null, invalid: boolean }`.
2. Use it in `create_todo` and `update_todo`:
   - create: an invalid value stores `doByDate: null`,
   - update: an invalid value leaves the existing date unchanged (the field is
     treated as omitted).
3. Keep the existing successful forms unchanged: ISO 8601 date-time, empty
   string, and `none`.
4. Include a `warnings` entry in the tool output (and a server log line) when a
   date was ignored, without echoing huge model output.
5. Audit other model-provided date fields and apply the same never-fail policy.
6. Document the behavior and add cases for invalid month/day, arbitrary text,
   empty, `none`, and valid ISO input.

**Done when:**

- Invalid date input completes the tool without failing: create stores no date,
  update keeps the existing date, and a warning is reported.
- Valid dates and explicit clears behave exactly as before.
- Types/lint/build pass.

---

## Suggested order

1. Lenient dates (small reliability fix)
2. Switch tool (unblocks the new branching flows)
3. File blocks
4. Real-time updates
5. OCR/vision

Lenient dates and switch are the highest-value changes for task runs. OCR/vision
depends on an external vision model and can ship last. Audio transcription and the
settings/compose groundwork are already done.

## Out of scope

- Filesystem watcher (`chokidar`) for live reindexing.
- Monaco/CodeMirror code editor (the current textarea stays).
