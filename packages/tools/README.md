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

## Boundaries

- This package depends on `@repo/db` and `@repo/ai`.
- The backend imports tools only through `@repo/tools` (and the
  `apps/backend/src/tools` re-export shim).
- Queue behaviour lives in the backend queue processor, not here; tools only
  describe what the next step should do.
