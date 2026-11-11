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

## Boundaries

- This package depends on `@repo/db` and `@repo/ai`.
- The backend imports tools only through `@repo/tools` (and the
  `apps/backend/src/tools` re-export shim).
- Queue behaviour lives in the backend queue processor, not here; tools only
  describe what the next step should do.
