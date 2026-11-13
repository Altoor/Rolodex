# @repo/tools

Owns every executable task tool plus its shared model, condition and utility
helpers.

## Layout

- `src/model/` — tool-facing types (`Tool`, `ToolDefinition`, `ToolExecution`,
  `ToolRunContext`, tool state and input errors).
- `src/utils/` — general helpers: JSON parsing, tool input readers, tool-state
  application, path lookup, value comparison, numbers and dates.
- `src/conditions/` — the `where` expression language used by `if` and
  `filter_tool_state`.
- `src/tools/<tool>/` — one folder per tool. Tools receive a `ToolRunContext`
  and return a `ToolExecution`; they do not touch the queue directly.
- `src/registry/` — the single composition point that lists tools and looks
  them up by key.

## Adding a tool

1. Create `src/tools/<key>/` with the tool implementation.
2. Define a `ToolDefinition` (`key`, `name`, `description`, `category`,
   `inputMode`, `inputSchema`, `outputDescription`, optional `outputTypes`,
   optional `exampleConfig`).
3. Return a `ToolExecution` with `output`, `summary`, and any state changes
   (`toolStateAppend`, `toolState`, `nextState`, `clearToolState`,
   `appendOutput`, `foreach`, `branch`, model overrides).
4. Register the tool in `src/registry/registry.ts`.

## Prompt structured fields

The `prompt` tool normally returns `{ text, thinking, model }` and appends
`{ text }` to the next step's toolState. Add a `fields` object to request named
values instead:

```json
{
  "prompt": "Return a folder name and description for a folder of tax documents.",
  "fields": {
    "name": {
      "type": "string",
      "description": "Short folder name. No slashes."
    },
    "description": { "type": "string", "description": "One or two sentences." }
  }
}
```

Supported types are `string`, `number`, `boolean`, `object`, `array`, and
`enum` (use `values` for the allowed enum values). Every field is required
unless it sets `"required": false`. The tool builds a JSON schema, passes it to
Ollama as `format`, validates the response, and appends the parsed fields
alongside `text`. Because the fields are top-level toolState entries, later
tasks can use `name`, `description`, and so on directly.

`onInvalid` controls a response that cannot be parsed or validated:

- `"fail"` (default) throws an error containing the raw model output.
- `"text"` keeps the raw answer in `text` and omits structured fields.

`fields` and the raw `format` escape hatch cannot be combined.

## Prompt templates

`prompt` and `system` support `{{path}}` placeholders that resolve against
earlier toolState. Use them to embed a file's contents or another tool's
output:

```json
{
  "prompt": "Summarise this file in one short sentence:\n\n{{content}}",
  "fields": {
    "description": { "type": "string" }
  }
}
```

For example, after `read_plaintext_file` the next task sees `{{content}}` and
`{{file.name}}`. A missing path fails with a clear error instead of sending the
literal placeholder. To append the whole toolState instead, set
`"useToolState": true`.

## Wiring prompt output to todo tools

`create_todo` and `update_todo` no longer call a model. They read explicit
`name`, `description`, `doByDate` (or the aliases `date` / `dueDate`), and
`done` values from toolConfig and earlier toolState.

### Creating a todo

The easiest wiring is to give the prompt task fields with the same names and
leave the create-todo config empty:

```json
{
  "prompt": "Create a todo for: review the tax documents before Friday.",
  "fields": {
    "name": { "type": "string" },
    "description": { "type": "string" },
    "doByDate": {
      "type": "string",
      "description": "ISO 8601 timestamp, e.g. 2026-11-20T17:00:00+01:00. Empty when there is no due date."
    },
    "done": { "type": "boolean", "required": false }
  }
}
```

Then connect the prompt task to a `create_todo` task with an empty config:

```json
{}
```

Why this works: the prompt appends `{ text, name, description, doByDate, done }`
to toolState, and `create_todo` merges those top-level keys into its input. If
the prompt omits `done`, add `{ "done": false }` to the create-todo config.

### Updating a todo

`update_todo` is partial: only provided fields change. Keep the selector in its
config, or place a `find_todo` task before it so the todo id is already in
toolState:

```json
{ "id": 42 }
```

Then a prompt task with matching fields can supply the update values:

```json
{
  "prompt": "Summarise the current todo and mark it done if the work is finished.",
  "fields": {
    "description": { "type": "string" },
    "doByDate": {
      "type": "string",
      "description": "ISO 8601 timestamp. Empty when there is no due date."
    },
    "done": { "type": "boolean", "required": false }
  }
}
```

Only `description`, `doByDate`, and `done` change in this example. If the prompt
also publishes `name`, `update_todo` will rename the todo. To clear a
description or due date, publish an empty string.

If you prefer different prompt field names, either rename them in the prompt
`fields` object or use one of the accepted date aliases. A prompt created with
`onInvalid: "text"` can still fall back to raw text, but then the create/update
fields will be missing and `create_todo` will fail with a clear validation error.

### Invalid dates are ignored

Models sometimes return values like `"next friday"` or `"2026-13-45"`. Those no
longer fail the task:

- `create_todo` stores `doByDate: null`.
- `update_todo` keeps the existing due date (the field is treated as omitted).
- The tool output includes a `warnings` array and the backend logs the same
  message. Long values are truncated in the message.

Empty strings and `"none"` still mean "no due date"; ISO 8601 date-times with a
time-of-day are still parsed normally. If an `update_todo` call supplies only an
invalid date, it returns the todo unchanged with a warning instead of failing.

## File tools

File and folder tools share one lookup layer. They accept an explicit `id` or
`path`, and also resolve an id from earlier toolState keys `entry`, `file`,
`files`, `folder`, or `folders`. This means a foreach child can pass
`{ entry }` or `{ file }` straight to the next task.

Available tools: `find_file`, `find_files`, `find_folder`, `find_folders`,
`scan_files`, `create_file`, `create_folder`, `read_plaintext_file`,
`read_text_file`, `read_image_file`, `read_audio_file`, `read_video_file`,
`read_other_file`, `update_file_metadata`, `delete_file_entry`, and
`detect_file_type`.

`scan_files` has two output modes:

- Normal: appends `{ changes, counts }`; unchanged entries are omitted unless
  `includeUnchanged: true`.
- Foreach: enqueues one child per included entry. It includes unchanged entries
  by default, skips folders by default (`kind: "file"`), and accepts
  `fileType` such as `"plaintext"` to match the reader:

```json
{
  "path": "notes",
  "kind": "file",
  "fileType": "plaintext",
  "includeUnchanged": true
}
```

A typical summarise flow:

```text
scan_files (foreach, fileType: plaintext)
  └── read_plaintext_file
        └── prompt { fields: { description }, prompt: "Summarise:\n\n{{content}}" }
              └── update_file_metadata
```

The files page runner seeds `files` and `folders` into the first step's
toolState, so a task started by dropping files can process them without a scan.
The UI Refresh button calls the same indexer as `pnpm files:index`.

### Vision and OCR

`read_image_file` can ask a vision model to describe an image or extract its
text. Both are opt-in:

```json
{ "path": "inbox/receipt.png", "ocr": true }
```

```json
{ "describe": true }
```

You can also pass a custom `prompt`, which implies vision even when `describe`
and `ocr` are false. The model resolves from the user's **Vision model** setting
(the `/user` page), then the `VISION_MODEL` environment variable. There is no
silent fallback to a text-only generation model; if neither is configured, the
tool returns a warning that explains what to set.

Vision failures (model missing, timeout, no text) are non-fatal: the output still
contains the file metadata and preview URL, plus a `warning` string. Raw image
bytes are only added to toolState when `includeBase64: true`; vision calls encode
the image internally and do not require it.

## Branching: if vs switch

Both tools are deterministic and never call a model:

- `if` evaluates one `where` expression and continues on `true` or `false`.
- `switch` evaluates ordered cases and continues on the first match, or on
  `defaultTaskId` when nothing matches.

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

Case `id` values must be stable and unique; case labels must be unique. The task
flow renders one output handle per case (`switch:<id>`) plus a separate Default
handle. A matched case without a target stops the run with a note instead of
falling through. If no case matches and there is no default, the run also stops.
The task result records `branchLabel` so the run view shows which case fired.

## Boundaries

- This package depends on `@repo/db` and `@repo/ai`.
- The backend imports tools only through `@repo/tools` (and the
  `apps/backend/src/tools` re-export shim).
- Queue behaviour lives in the backend queue processor, not here; tools only
  describe what the next step should do.
