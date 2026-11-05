# Tools feature implementation plan

## Goal

Add a first-class **tools** system:

1. A tools page that shows information about every available tool.
2. Tasks with `type = "tool"` are actually executed by the queue processor.
3. Implement these tools first:
   - `prompt` — prompt another LLM, wait for the answer, return it.
   - `create_todo` — create a todo.
   - `update_todo` — update a todo.
   - `mark_todo_done` — mark a todo done or not done.
   - `delete_todo` — delete a todo.

A todo already has a `name` and a `content` column. `content` is the
description for the purposes of this feature. The `prompt` tool/helper must be
reusable by the todo tools so it can fill in a todo's `name` and description
when they are not supplied explicitly.

---

## Design decisions

- **Tools are code-defined, not database rows.** The tool registry is the
  single source of truth for tool metadata (`key`, `name`, `description`,
  input schema, examples). This avoids stale tool tables and makes the tool
  implementation and its metadata live together.
- **Tasks reference a tool by key.** Add `toolKey` (nullable text) and
  `toolConfig` (nullable JSON) to `tasks`. `toolKey` is a stable identifier such
  as `prompt` or `create_todo`.
- **Tool input comes from two places:**
  1. The queued task's `state` string (what the user types on the landing page).
  2. The task's `toolConfig` JSON (defaults/fixed arguments).
  If `state` is valid JSON, its values override `toolConfig`. If `state` is
  plain text, tools use it as free-form input and/or use the `prompt` helper to
  extract structured fields from it.
- **Tool tasks continue through `fallbackTaskId`.** Tool tasks do not use
  `TaskResult` rows. For a tool task, the existing fallback edge is the normal
  "next task" edge. A tool may also return an explicit `nextTaskId` later.
- **Tool output is stored in `queuedTasks.result`.** It has the same shape as a
  decision step plus a tool-specific `output` field, so the existing queue
  subscription/chain-of-thought UI can display it.
- **No todo database migration is required.** `todos.name` is the todo name and
  `todos.content` is the description.

### Change-type legend

- `[NEW]` — create a new file.
- `[EDIT]` — modify an existing file.
- `[DB]` — schema/migration change.
- `[GRAPHQL]` — GraphQL type/query/mutation change.
- `[QUEUE]` — queue execution change.
- `[UI]` — frontend component/page change.
- `[QUERIES]` — GraphQL document change in `packages/queries`.
- `[CODEGEN]` — regenerate generated GraphQL files.
- `[REFACTOR]` — move/extract existing code without behavior change.

---

## 1. Backend tool runtime

### 1.1 Add tool types

**File:** `apps/backend/src/tools/types.ts` — `[NEW]`

Define the shared contracts below. Keep this file free of database/queue
imports.

```ts
export type ToolConfig = Record<string, unknown>;

export type ToolInputMode = "text" | "json";

export interface ToolInputProperty {
  type: "string" | "number" | "boolean" | "object";
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolInputProperty>;
  required?: string[];
}

export interface ToolDefinition {
  /** Stable identifier stored on tasks, e.g. "prompt" or "create_todo". */
  key: string;
  /** Human-readable name shown on the tools page. */
  name: string;
  description: string;
  category: "ai" | "todo";
  inputMode: ToolInputMode;
  inputSchema: ToolInputSchema;
  outputDescription: string;
  /** Example `toolConfig` the tools page can display. */
  exampleConfig?: ToolConfig | null;
}

export interface ToolRunContext {
  userId: number;
  runId: string;
  taskId: number;
  queuedTaskId: number;
  /** Raw queued task state (the user's free-text input). */
  state: string;
  /** The task's `toolConfig` JSON, or null. */
  config: ToolConfig | null;
}

export interface ToolExecution {
  /** Arbitrary JSON stored as `queuedTasks.result.output`. */
  output: unknown;
  /** Short human-readable description shown in the queue UI. */
  summary: string;
  /** Text appended to the next queue step's state. */
  stateAppend?: string;
  /**
   * Whether to append `stateAppend`/`summary` to the next step's state.
   * When omitted, the queue falls back to `toolConfig.appendState`.
   */
  appendState?: boolean;
  /** Optional explicit next task; otherwise the queue uses fallbackTaskId. */
  nextTaskId?: number | null;
}

export interface Tool {
  definition: ToolDefinition;
  execute(context: ToolRunContext): Promise<ToolExecution>;
}

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}
```

### 1.2 Add input parsing helpers

**File:** `apps/backend/src/tools/input.ts` — `[NEW]`

Add helpers used by every tool:

- `parseJsonObject(value: string): Record<string, unknown> | null`
  - Return `null` for empty/plain text or invalid JSON. Never throw.
  - Only return objects; arrays/primitives return `null`.
- `mergeToolInput(context: ToolRunContext): Record<string, unknown>`
  - Start with `{ ...(context.config ?? {}) }`.
  - If `parseJsonObject(context.state)` is non-null, merge it on top so JSON
    state overrides config.
  - Do not put the raw plain-text state into the object; tools read
    `context.state` directly when they need free-form text.
- `readString(input, key): string | undefined`
- `readNumber(input, key): number | undefined`
- `readBoolean(input, key): boolean | undefined`
  - Validate the runtime type and throw `ToolInputError` with a clear message
    when a present value has the wrong type.
- `requireNonEmptyString(value, fieldName): string`
  - Throw `ToolInputError` when missing/blank.

### 1.3 Extract the model lookup helper

**File:** `apps/backend/src/ai/model.ts` — `[NEW]` / `[REFACTOR]`

Move the existing `DEFAULT_MODEL` and `modelForUser` logic out of
`apps/backend/src/queue/processor.ts`:

```ts
export const DEFAULT_MODEL = "tev1:4b";

export async function getModelForUser(userId: number): Promise<string> {
  // Same query as the current modelForUser(): read userSettings.defaultModelName,
  // fall back to DEFAULT_MODEL.
}
```

Then:

- **File:** `apps/backend/src/queue/processor.ts` — `[EDIT]`
  - Remove the local `DEFAULT_MODEL` constant and `modelForUser()` function.
  - Import `DEFAULT_MODEL` and `getModelForUser` from `../ai/model`.
  - Replace calls to `modelForUser(row.queued_by)` with
    `getModelForUser(row.queued_by)`.

This lets the prompt tool use the same user default model.

### 1.4 Implement the prompt tool

**File:** `apps/backend/src/tools/prompt.ts` — `[NEW]`

Export a reusable function and the tool object:

```ts
export interface PromptOptions {
  prompt: string;
  system?: string;
  model?: string;
  format?: Record<string, unknown>;
}

export interface PromptResult {
  text: string;
  thinking?: string;
  model: string;
}

export async function runPrompt(
  userId: number,
  options: PromptOptions,
): Promise<PromptResult>;
```

Implementation details:

- Resolve the model as `options.model ?? (await getModelForUser(userId))`.
- Call `ollama.generate({ model, prompt, system, format })` using the shared
  `ollama` instance from `apps/backend/src/ai/Ollama.ts`.
- Return `response.response` as `text`, `response.thinking` as `thinking` (if
  present), and the resolved `model`.
- If Ollama returns an empty response, throw `ToolInputError` or a plain
  `Error` with a useful message.

Define `promptTool: Tool` with this definition:

- `key: "prompt"`
- `name: "Prompt"`
- `description: "Send a prompt to an installed Ollama model, wait for the answer, and return it."`
- `category: "ai"`
- `inputMode: "text"`
- Input schema properties:
  - `prompt` (`string`): optional; defaults to the queued task's `state`.
  - `system` (`string`): optional system prompt.
  - `model` (`string`): optional installed model override.
  - `format` (`object`): optional JSON schema passed to Ollama for structured
    output.
- `outputDescription: "The model answer as text, plus the model name and optional thinking text."`
- `exampleConfig: { "system": "You are a helpful assistant.", "appendState": true }`

`execute` behavior:

1. `const input = mergeToolInput(context)`.
2. `const prompt = readString(input, "prompt") ?? context.state`.
3. Throw `ToolInputError("prompt is required")` if both are blank.
4. Call `runPrompt(context.userId, { prompt, system, model, format })`.
5. Return:

```ts
{
  output: { text, thinking, model },
  summary: text,
  stateAppend: text,
  // Prompt answers are normally useful to the next task.
  appendState: true,
}
```

### 1.5 Implement the todo tools

**File:** `apps/backend/src/tools/todos.ts` — `[NEW]`

All todo tools live here so they can share helpers. They must use the existing
Drizzle `db` from `apps/backend/src/schema/builder.ts` and the `todos` table
from `apps/backend/src/db`.

#### Shared helpers

- `listUserTodos(userId: number)`
  - `db.query.todos.findMany({ where: { OR: [{ authorId: userId }, { actorId: userId }] } })`
  - Mirrors the ownership rule in `todo-queries.ts`/`todo-mutations.ts`.
- `loadUserTodo(userId: number, id: number)`
  - Same ownership filter plus `{ id }`.
  - Throw `ToolInputError("todo <id> not found")` when missing/not owned.
- `extractTodoFields(userId: number, context: ToolRunContext)`
  - Read `name` and `description`/`content` from `mergeToolInput(context)`.
  - If both are present, return them.
  - Otherwise call `runPrompt` from `tools/prompt.ts` with a prompt that asks
    for a structured `{ name, description }` from `context.state` (and any
    supplied partial fields). Pass an Ollama JSON `format` schema:
    ```ts
    {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name", "description"],
    }
    ```
  - Parse the JSON text. If parsing fails or fields are blank, throw
    `ToolInputError("could not determine todo name/description")`.
  - Return `{ name, description }`.
  - This is the key requirement: the prompt helper fills in the todo fields.
- `resolveTodoId(userId: number, context: ToolRunContext)`
  - Read an explicit `id`/`todoId` number from `mergeToolInput(context)`.
  - If present, call `loadUserTodo` and return it.
  - Otherwise load all user todos.
  - If there are no todos, throw `ToolInputError("no todos found")`.
  - If there is exactly one, use it.
  - Otherwise call `runPrompt` with the user's todos (`id`, `name`, `done`) and
    `context.state`, using a JSON schema:
    ```ts
    {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    }
    ```
  - Validate that the returned id belongs to the user's todo list; otherwise
    throw `ToolInputError`.
  - Return the selected todo.

#### `createTodoTool`

- Definition:
  - `key: "create_todo"`
  - `name: "Create todo"`
  - `description: "Create a todo. Name and description are taken from toolConfig, JSON state, or inferred from the state with the prompt tool."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema: optional `name` (`string`), optional `description`
    (`string`).
  - Output: the created `Todo`.
  - Example config: `{ "name": "Pick up Johnny from daycare", "description": "Pick him up this afternoon." }`
- Execute:
  1. `extractTodoFields(context.userId, context)`.
  2. Insert into `todos`:
     ```ts
     {
       name,
       content: description,
       done: false,
       authorId: context.userId,
       actorId: context.userId,
     }
     ```
  3. Return `{ output: { todo }, summary: `Created todo "${name}"` }`.

#### `updateTodoTool`

- Definition:
  - `key: "update_todo"`
  - `name: "Update todo"`
  - `description: "Update a todo's name and/or description. The todo can be selected by id or inferred from state."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema: optional `id` (`number`), optional `name` (`string`),
    optional `description` (`string`).
  - Output: the updated `Todo`.
  - Example config: `{ "id": 3, "name": "Updated name", "description": "Updated description" }`
- Execute:
  1. `const todo = await resolveTodoId(context.userId, context)`.
  2. Read `name` and `description` from `mergeToolInput(context)`.
  3. If neither is supplied, call `extractTodoFields` and use those values.
  4. Update with `name ?? todo.name`, `content: description ?? todo.content`.
  5. Return `{ output: { todo: updated }, summary: `Updated todo "${updated.name}"` }`.

#### `markTodoDoneTool`

- Definition:
  - `key: "mark_todo_done"`
  - `name: "Mark todo done"`
  - `description: "Mark a todo as done or not done. The todo can be selected by id or inferred from state."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema: optional `id` (`number`), optional `done` (`boolean`,
    default `true`).
  - Output: the updated `Todo`.
  - Example config: `{ "id": 3, "done": true }`
- Execute:
  1. `const todo = await resolveTodoId(context.userId, context)`.
  2. `const done = readBoolean(mergeToolInput(context), "done") ?? true`.
  3. Update `{ done }`.
  4. Return `{ output: { todo: updated }, summary: done ? `Marked todo "${updated.name}" as done` : `Marked todo "${updated.name}" as not done` }`.

#### `deleteTodoTool`

- Definition:
  - `key: "delete_todo"`
  - `name: "Delete todo"`
  - `description: "Delete a todo. The todo can be selected by id or inferred from state."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema: optional `id` (`number`).
  - Output: `{ id, name }` of the deleted todo.
  - Example config: `{ "id": 3 }`
- Execute:
  1. `const todo = await resolveTodoId(context.userId, context)`.
  2. Delete by `todo.id`.
  3. Return `{ output: { id: todo.id, name: todo.name }, summary: `Deleted todo "${todo.name}"` }`.

### 1.6 Add the tool registry

**File:** `apps/backend/src/tools/registry.ts` — `[NEW]`

- Import `promptTool` and the four todo tools.
- Keep one ordered array:
  ```ts
  export const tools: Tool[] = [
    promptTool,
    createTodoTool,
    updateTodoTool,
    markTodoDoneTool,
    deleteTodoTool,
  ];
  ```
- Build a `Map<string, Tool>` by `definition.key`.
- Export:
  - `listToolDefinitions(): ToolDefinition[]`
  - `getToolDefinition(key: string): ToolDefinition | undefined`
  - `getTool(key: string): Tool | undefined`
  - `requireTool(key: string): Tool` (throws a clear `Error` if missing)
- Do not import `schema/index.ts` from this file or the tool handlers. Import
  the Drizzle client from `apps/backend/src/schema/builder.ts` only.

**File:** `apps/backend/src/tools/index.ts` — `[NEW]`

```ts
export * from "./types";
export * from "./registry";
export * from "./prompt";
```

Do not re-export every todo helper unless needed.

---

## 2. Database changes

### 2.1 Task columns

**File:** `apps/backend/src/db/schema.ts` — `[EDIT]` `[DB]`

In the `tasks` table definition, add:

```ts
toolKey: text("toolKey"),
toolConfig: json("toolConfig"),
```

Both are nullable so existing tasks keep working. Do not add a `tools` table;
tool metadata comes from the code registry.

### 2.2 Generate and apply the migration

- Run from the repo root:
  - `pnpm --filter backend generate`
- Review the new migration under
  `apps/backend/drizzle/<new-timestamp>/migration.sql`. It should contain
  `ALTER TABLE "tasks" ADD COLUMN "toolKey" text;` and
  `ALTER TABLE "tasks" ADD COLUMN "toolConfig" json;`.
- Apply it using the project's existing workflow:
  - `pnpm --filter backend push` for a dev database, or the team's normal
    `drizzle-kit migrate` command if migrations are applied explicitly.
- Do not hand-edit a migration snapshot unless `generate` is unavailable.
  If it is unavailable, create the SQL migration manually and update the
  snapshot consistently.

### 2.3 Relations

**File:** `apps/backend/src/db/relations/relations.ts` — `[EDIT]` (likely no change)

No new relation is required because tools are not tables. Leave existing task
relations unchanged.

---

## 3. GraphQL changes

### 3.1 Tool object and queries

**File:** `apps/backend/src/schema/tool/tool.ts` — `[NEW]` `[GRAPHQL]`

- Import `ToolDefinition` from `../../tools/types` and `builder` from
  `../builder`.
- Create:
  ```ts
  export const Tool = builder
    .objectRef<ToolDefinition>("Tool")
    .implement({
      description: "A runnable tool available to tool tasks.",
      fields: (t) => ({
        key: t.exposeString("key"),
        name: t.exposeString("name"),
        description: t.exposeString("description"),
        category: t.exposeString("category"),
        inputMode: t.exposeString("inputMode"),
        inputSchema: t.field({
          type: "JSON",
          resolve: (parent) => parent.inputSchema,
        }),
        outputDescription: t.exposeString("outputDescription"),
        exampleConfig: t.field({
          type: "JSON",
          nullable: true,
          resolve: (parent) => parent.exampleConfig ?? null,
        }),
      }),
    });
  ```

**File:** `apps/backend/src/schema/tool/tool-queries.ts` — `[NEW]` `[GRAPHQL]`

Add to `builder.queryType`:

- `tools: [Tool!]!`
  - Resolve with `listToolDefinitions()` from `../../tools/registry`.
  - Require a logged-in user with `requireUserId(ctx)` for consistency with the
    other authenticated queries (or omit if the team prefers a public catalog;
    keep it authenticated by default).
- `getTool(key: String!): Tool`
  - Resolve with `getToolDefinition(key)`.
  - Throw a `GraphQLError("Tool not found")` with `BAD_USER_INPUT` when missing.

**File:** `apps/backend/src/schema/tool/index.ts` — `[NEW]`

```ts
export * from "./tool";
export * from "./tool-queries";
```

**File:** `apps/backend/src/schema/index.ts` — `[EDIT]`

Add `import "./tool/index";` alongside the other schema imports.

### 3.2 Extend the Task GraphQL object

**File:** `apps/backend/src/schema/task/task.ts` — `[EDIT]` `[GRAPHQL]`

- Import `Tool` from `../tool` and `getToolDefinition` from
  `../../tools/registry`.
- Add to the `Task` object fields:
  ```ts
  toolKey: t.exposeString("toolKey", { nullable: true }),
  toolConfig: t.field({
    type: "JSON",
    nullable: true,
    resolve: (parent) => parent.toolConfig ?? null,
  }),
  tool: t.field({
    type: Tool,
    nullable: true,
    resolve: (parent) =>
      parent.toolKey ? getToolDefinition(parent.toolKey) : null,
  }),
  ```
- Keep the existing `type`, `decision`, `taskResults`, `fallbackTask` fields.

No change is required to `QueuedTask` itself; clients can follow its `task`
relation and read `task.toolKey`.

### 3.3 Extend task mutations

**File:** `apps/backend/src/schema/task/task-mutations.ts` — `[EDIT]` `[GRAPHQL]`

#### `createTask`

- Add arguments:
  ```ts
  toolKey: t.arg.string(),
  toolConfig: t.arg({ type: "JSON" }),
  ```
- Include them in the inserted object:
  ```ts
  {
    name,
    type,
    decisionId,
    fallbackTaskId,
    toolKey: toolKey ?? null,
    toolConfig: toolConfig ?? null,
  }
  ```
- Remove the empty `switch (type)` block.
- Validate after building the object:
  - If `type === "tool"`, require `toolKey` and verify it exists with
    `getToolDefinition(toolKey)`. Throw `GraphQLError` with
    `BAD_USER_INPUT` when missing/unknown.
  - If `type !== "tool"`, allow `toolKey` to be omitted or null.
- A shared helper is recommended:
  ```ts
  function assertValidToolTask(type: string, toolKey: string | null) {
    if (type !== "tool") return;
    if (!toolKey) throw new GraphQLError("toolKey is required for tool tasks", ...);
    if (!getToolDefinition(toolKey)) throw new GraphQLError(`Unknown tool "${toolKey}"`, ...);
  }
  ```

#### `updateTask`

- Add arguments:
  ```ts
  toolKey: t.arg.string(),
  toolConfig: t.arg({ type: "JSON" }),
  ```
- Use explicit-null-aware merge semantics, like `fallbackTaskId`:
  ```ts
  toolKey: toolKey !== undefined ? toolKey : task.toolKey,
  toolConfig: toolConfig !== undefined ? toolConfig : task.toolConfig,
  ```
  This allows the UI to clear a tool by sending `null`.
- Determine the effective type (`type ?? task.type`) and effective tool key
  (`toolKey !== undefined ? toolKey : task.toolKey`), then call
  `assertValidToolTask(...)`.
- Remove the empty `switch (type)` block.

### 3.4 Optional Todo description alias

**File:** `apps/backend/src/schema/todo/todo.ts` — `[EDIT]` `[GRAPHQL]` (recommended)

Add an additive alias so API consumers can use the word "description" while the
database keeps `content`:

```ts
description: t.exposeString("content"),
```

This does not require a migration and does not break existing `content`
consumers.

---

## 4. Queue execution for tool tasks

**File:** `apps/backend/src/queue/processor.ts` — `[EDIT]` `[QUEUE]`

### 4.1 Import the tool runtime

Add imports for `getTool`, `ToolInputError`, and the shared tool config type.

### 4.2 Branch before the decision check

In `processStep`, after the task is loaded and marked `running`, replace the
current block:

```ts
if (task.type !== "decision" || task.decisionId == null) {
  // currently marked completed with a "skipped" note
}
```

with:

```ts
if (task.type === "tool") {
  await processToolStep(row, task, stepsByRun);
  return;
}

if (task.type !== "decision" || task.decisionId == null) {
  await finishStep(row.id, "completed", {
    note: `skipped: task type "${task.type}" is not runnable yet`,
  });
  return;
}
```

### 4.3 Add `processToolStep`

Add a helper in the same file (or a small `queue/toolStep.ts` if preferred; if
split out, export `finishStep` or pass the needed callbacks):

```ts
async function processToolStep(
  row: QueuedRow,
  task: typeof tasks.$inferSelect,
  stepsByRun: Map<string, number>,
): Promise<void> {
  if (!task.toolKey) {
    await finishStep(row.id, "failed", {
      toolKey: null,
      note: "tool task has no toolKey",
    });
    return;
  }

  const tool = getTool(task.toolKey);
  if (!tool) {
    await finishStep(row.id, "failed", {
      toolKey: task.toolKey,
      note: `unknown tool "${task.toolKey}"`,
    });
    return;
  }

  const toolConfig =
    (task.toolConfig as Record<string, unknown> | null) ?? null;

  try {
    const execution = await tool.execute({
      userId: row.queued_by,
      runId: row.runId,
      taskId: task.id,
      queuedTaskId: row.id,
      state: row.state,
      config: toolConfig,
    });

    const steps = (stepsByRun.get(row.runId) ?? 0) + 1;
    stepsByRun.set(row.runId, steps);

    let nextTaskId = execution.nextTaskId ?? task.fallbackTaskId ?? null;
    let note: string | undefined;

    if (nextTaskId != null && steps >= MAX_STEPS_PER_RUN) {
      nextTaskId = null;
      note = `max chain depth (${MAX_STEPS_PER_RUN}) reached — run stopped`;
    }

    const result = {
      toolKey: task.toolKey,
      output: execution.output,
      summary: execution.summary,
      branch: nextTaskId != null ? "tool" : "none",
      nextTaskId,
      ...(note ? { note } : {}),
    };

    await finishStep(row.id, "completed", result, execution.summary);

    if (nextTaskId != null) {
      const append =
        execution.appendState ?? Boolean(toolConfig?.appendState);
      const nextState = append
        ? `${row.state}\n\n${execution.stateAppend ?? execution.summary}`
        : row.state;

      await db.insert(queuedTasks).values({
        taskId: nextTaskId,
        state: nextState,
        runId: row.runId,
        queued_by: row.queued_by,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishStep(row.id, "failed", {
      toolKey: task.toolKey,
      note: `tool error: ${message}`,
    });
  }
}
```

Notes:

- `MAX_STEPS_PER_RUN` and `stepsByRun` retain the existing chain-depth guard.
- `finishStep` publishes the queued task event, so the existing subscription UI
  receives tool progress without changes.
- `toolConfig.appendState` is the generic opt-in for passing tool output to the
  next step. The prompt tool opts in itself via `execution.appendState = true`.
- Tool tasks with no `fallbackTaskId` finish the run (`nextTaskId = null`).

---

## 5. GraphQL documents in `packages/queries`

### 5.1 Tool documents

**File:** `packages/queries/src/tools/tool-queries.ts` — `[NEW]` `[QUERIES]`

```ts
import { gql } from "../__generated__";

export const TOOLS = gql(/* GraphQL */ `
  query GetTools {
    tools {
      key
      name
      description
      category
      inputMode
      inputSchema
      outputDescription
      exampleConfig
    }
  }
`);

export const GET_TOOL = gql(/* GraphQL */ `
  query GetTool($key: String!) {
    getTool(key: $key) {
      key
      name
      description
      category
      inputMode
      inputSchema
      outputDescription
      exampleConfig
    }
  }
`);
```

### 5.2 Task documents

**File:** `packages/queries/src/tasks/task-queries.ts` — `[EDIT]` `[QUERIES]`

- In `TASKS`, add to each task:
  ```graphql
  toolKey
  toolConfig
  tool {
    key
    name
    description
  }
  ```
- In `GET_TASK`, add the same fields.
- In `QUEUED_TASK`, add `toolKey` inside `task { ... }`.

**File:** `packages/queries/src/tasks/task-mutations.ts` — `[EDIT]` `[QUERIES]`

- `CREATE_TASK`:
  - Add variables `$toolKey: String`, `$toolConfig: JSON`.
  - Pass `toolKey: $toolKey`, `toolConfig: $toolConfig`.
  - Select `toolKey`, `toolConfig`, and `tool { key name description }`.
- `UPDATE_TASK`:
  - Same new variables and arguments.
  - Select `toolKey`, `toolConfig`, and `tool { key name description }`.

**File:** `packages/queries/src/tasks/task-subscriptions.ts` — `[EDIT]` `[QUERIES]`

- In `queuedTask.task`, add `toolKey` so chain-of-thought steps can label tool
  tasks.

### 5.3 Regenerate generated GraphQL files

**Type:** `[CODEGEN]`

After the backend schema changes compile and the API is running:

1. Start the API if it is not already running:
   - `pnpm --filter backend api`
2. In another terminal, from the repo root:
   - `pnpm --filter @repo/queries codegen`
   - or `pnpm codegen` to run codegen across the workspace.

This regenerates:

- `packages/queries/src/__generated__/gql.ts`
- `packages/queries/src/__generated__/graphql.ts`
- `apps/web/src/__generated__/*` if applicable

Do not hand-edit generated files. If the API cannot be started in the
implementer's environment, run codegen with a schema exported from a build
server or update the generated files with the same codegen command later; the
typed documents must include `GetTools`, `GetTool`, and the new task fields.

---

## 6. Tools page (frontend)

### 6.1 Tool card component

**File:** `packages/ui/src/components/tools/toolCard.tsx` — `[NEW]` `[UI]`

Create a presentational card, similar in spirit to
`packages/ui/src/components/models/modelCard.tsx`.

Props derived from the generated `GetToolsQuery` item:

```ts
interface ToolCardProps {
  tool: NonNullable<GetToolsQuery["tools"]>[number];
}
```

Render:

- Tool `name` as `CardTitle`.
- `key` and `category` as `Badge`s (use `#components/ui/badge`).
- `description`.
- `inputMode` and `outputDescription`.
- Input fields from `inputSchema.properties`:
  - Use `inputSchema.required` to mark required fields.
  - Show each property name, type, description, and enum/default when present.
- `exampleConfig` inside a `<pre>` with `JSON.stringify(exampleConfig, null, 2)`.
- Keep the component client-safe and presentational; no data fetching.

Use existing UI primitives (`Card`, `CardContent`, `CardHeader`, `Badge`,
`Separator`) and `cn` where needed.

### 6.2 Tools page

**File:** `packages/ui/src/pages/tools.tsx` — `[NEW]` `[UI]`

Follow the structure of `packages/ui/src/pages/models.tsx`:

- `"use client"`.
- Wrap the content in `AuthGate`.
- `const { data, error, loading } = useQuery(TOOLS)`.
- `const tools = data?.tools ?? []`.
- Render:
  - `PageHeader title="Tools" description="Inspect the tools that tool tasks can run."`
  - `LoadingState` while loading.
  - `ErrorState` on error.
  - `EmptyState` when there are no tools.
  - A list/grid of `ToolCard`s.

### 6.3 Next.js route

**File:** `apps/web/app/tools/page.tsx` — `[NEW]` `[UI]`

```tsx
import ToolsPage from "@repo/ui/pages/tools";

export default function Page() {
  return <ToolsPage />;
}
```

### 6.4 Navigation entry

**File:** `packages/ui/src/components/headerMenu/headerMenu.tsx` — `[EDIT]` `[UI]`

Add to `NAV_ITEMS`, probably after Task queue or Models:

```ts
{ href: "/tools", label: "Tools", requiresAuth: true },
```

---

## 7. Task builder UI for tool tasks

### 7.1 Form values

**File:** `packages/ui/src/components/task/task-form.ts` — `[EDIT]` `[UI]`

Extend `TaskFormValues` with:

```ts
toolKey: string | null;
toolConfigText: string;
```

Update:

- `emptyTaskFormValues`:
  ```ts
  toolKey: null,
  toolConfigText: "",
  ```
- `taskToFormValues`:
  ```ts
  toolKey: task.toolKey ?? null,
  toolConfigText: task.toolConfig
    ? JSON.stringify(task.toolConfig, null, 2)
    : "",
  ```

Using a text field (`toolConfigText`) avoids react-hook-form needing nested
object validation; parse it only when saving.

### 7.2 Task builder save logic

**File:** `packages/ui/src/components/task/taskBuilder.tsx` — `[EDIT]` `[UI]`

- Add `useQuery(TOOLS)` and pass `data?.tools ?? []` to `TaskCard`.
- Parse the JSON config when saving:
  ```ts
  let toolConfig: Record<string, unknown> | null = null;
  if (values.type === "tool" && values.toolConfigText.trim()) {
    try {
      toolConfig = JSON.parse(values.toolConfigText);
    } catch {
      // set a form error / show ErrorState and abort the save
      return;
    }
  }
  ```
  Reject parsed values that are not plain objects (arrays/null are invalid).
- Include in `taskVariables`:
  ```ts
  toolKey: values.type === "tool" ? values.toolKey : null,
  toolConfig,
  ```
- If `values.type === "tool"` and `values.toolKey` is empty, do not save; show
  a validation message.
- When creating a task, keep the existing behavior of placing `createdTaskId`
  and result task IDs.
- Only render the `DecisionList`/`DecisionBuilder` section when
  `values.type === "decision"` (use `watch("type")` or `getValues("type")`).
  For tool tasks, hide decision selection to avoid confusion.

### 7.3 Task card

**File:** `packages/ui/src/components/task/taskCard/taskCard.tsx` — `[EDIT]` `[UI]`

- Add a `tools` prop:
  ```ts
  tools: Array<{
    key: string;
    name: string | null;
    description: string | null;
    exampleConfig?: unknown;
  }>;
  ```
- `const type = useWatch({ control, name: "type" })` already exists.
- When `type === "tool"`, render:
  - A `SelectController` for `toolKey` with `rules={{ required: "select a tool" }}`.
    Options from `tools`.
  - A `Field` with a `Textarea` bound to `toolConfigText`, labeled
    "Tool config (JSON)".
  - `FieldDescription` explaining: "Optional JSON. For example: `{\"id\": 3, \"done\": true}`. The queued task state is also passed to the tool."
  - The selected tool's `description` and example config, if available.
- Keep the existing results section only for `type === "decision"`.
- Import `Textarea` from `#components/ui/textarea` and `FieldDescription` from
  `#components/ui/field`.

### 7.4 Task flow display

**File:** `packages/ui/src/components/task/taskFlow/taskFlowTypes.ts` — `[EDIT]` `[UI]`

- Add `toolKey: string | null` to `TaskFlowNodeData`.
- Optionally add `toolConfig` if needed for display.

**File:** `packages/ui/src/components/task/taskFlow/taskFlow.tsx` — `[EDIT]` `[UI]`

- When mapping tasks to node data, include:
  ```ts
  toolKey: task.toolKey ?? null,
  ```

**File:** `packages/ui/src/components/task/taskFlow/taskFlowNode.tsx` — `[EDIT]` `[UI]`

- For tool tasks (`data.type === "tool"`), show the tool key/name near the
  task title, e.g. `Tool · create_todo`.
- Leave the fallback output handle visible. For tool tasks it is the normal
  continuation edge.

### 7.5 Landing / run UI

**File:** `packages/ui/src/pages/landing.tsx` — `[EDIT]` `[UI]`

- Extend `StepResult`:
  ```ts
  branch?: "result" | "fallback" | "tool" | "none";
  output?: unknown;
  ```
- In the chain-of-thought branch label, handle `"tool"`:
  ```ts
  step.result?.branch === "tool"
    ? step.result.nextTaskId != null
      ? `next: ${taskName(step.result.nextTaskId)}`
      : "tool result"
    : ...
  ```
- The tool `summary` already appears through the existing
  `step.result.summary` rendering. Optionally show a compact JSON preview of
  `step.result.output` when it is present.
- No new submission form is required: users select a tool task and type the
  free-text state as before. Tool-specific arguments can be set in the task's
  `toolConfig`.

---

## 8. End-to-end examples

These examples should work after the changes.

### 8.1 Prompt → create todo chain

Task 1:

- `type: "tool"`
- `toolKey: "prompt"`
- `toolConfig: { "system": "Extract a todo name and description from the user text. Return JSON.", "appendState": true }`
- `fallbackTaskId: <task 2 id>`

Task 2:

- `type: "tool"`
- `toolKey: "create_todo"`
- `toolConfig: {}`

Run with state:

> "I need to pick up Johnny from daycare this afternoon."

Flow:

1. The prompt task sends the state to Ollama and appends the answer to the
   next state.
2. The create-todo task calls `extractTodoFields`, which uses `runPrompt` to
   produce `{ name, description }`.
3. A todo is inserted with the current user as both `authorId` and `actorId`.
4. The queue result for step 2 contains the created todo in `output`.

### 8.2 Direct create todo

- `type: "tool"`, `toolKey: "create_todo"`, `toolConfig: {}`
- State: "Buy milk and bread tonight."

`extractTodoFields` infers the name/description from the state.

### 8.3 Update todo

- `type: "tool"`, `toolKey: "update_todo"`
- `toolConfig: { "id": 3, "name": "Buy groceries", "description": "Milk, bread, eggs" }`

Or run with JSON state: `{ "id": 3, "description": "Milk, bread" }`.

### 8.4 Mark todo done / not done

- Done: `toolKey: "mark_todo_done"`, `toolConfig: { "id": 3, "done": true }`
- Not done: `toolKey: "mark_todo_done"`, `toolConfig: { "id": 3, "done": false }`
- If `id` is omitted, the tool tries to resolve the todo from the state using
  the user's todo list and the prompt helper.

### 8.5 Delete todo

- `toolKey: "delete_todo"`, `toolConfig: { "id": 3 }`
- Or JSON state `{ "id": 3 }`.
- If `id` is omitted, the tool resolves the todo from the state.

---

## 9. Error handling and validation rules

- Missing `toolKey` on a tool task → GraphQL validation error on save, and a
  failed queued step with a clear note if it somehow reaches the queue.
- Unknown `toolKey` → GraphQL validation error on save, failed queued step if
  it reaches the queue.
- Invalid `toolConfig` JSON in the UI → block the save and show an error.
- `toolConfig` must be a JSON object, not an array or primitive.
- Missing/invalid tool input → throw `ToolInputError`; the queue catches it and
  marks the step `failed` with `note: "tool error: ..."`.
- Todo operations must always be limited to todos where
  `authorId === userId` or `actorId === userId`, same as the existing GraphQL
  todo mutations.
- Never let an unhandled tool error escape `processQueue`; the queue loop must
  keep processing later rows.
- LLM JSON output must be parsed defensively. If it is not valid JSON or does
  not contain the expected fields, throw a useful `ToolInputError`.

---

## 10. Verification checklist

Run these after implementation:

1. **Database**
   - `pnpm --filter backend generate`
   - Review the generated SQL.
   - `pnpm --filter backend push` (or the project's migration command).
   - Confirm `tasks."toolKey"` and `tasks."toolConfig"` exist.
2. **Type checks**
   - `pnpm exec tsc -p apps/backend/tsconfig.json --noEmit`
   - `pnpm --filter @repo/queries build`
   - `pnpm --filter @repo/ui build:components`
   - `pnpm --filter web check-types`
   - Root `pnpm check-types` if the workspace scripts are configured for it.
3. **Codegen**
   - Start the backend.
   - Run `pnpm --filter @repo/queries codegen`.
   - Confirm generated types include `GetTools`, `GetTool`, `Task.toolKey`,
     `Task.toolConfig`, and `Task.tool`.
4. **Tools page**
   - Visit `/tools`.
   - Confirm all five tools appear with descriptions, input schemas, output
     descriptions, and example configs.
5. **Task builder**
   - Create a task with `type = Tool`, select `prompt`, save.
   - Confirm the task persists `toolKey = "prompt"`.
   - Create tool tasks for each todo tool and confirm the JSON config editor
     saves/reloads correctly.
6. **Queue execution**
   - Run a `prompt` task from the landing page. Confirm the step completes and
     the answer appears in the chain-of-thought result.
   - Run a `create_todo` task with free-text state. Confirm a todo is created
     with a name and description.
   - Run `update_todo`, `mark_todo_done` (both `true` and `false`), and
     `delete_todo`. Confirm the todo changes in the database/API.
   - Confirm a tool task can chain to a next task through `fallbackTaskId`, and
     that prompt output is appended to the next state.
7. **Failure cases**
   - Create a tool task without a tool key (via direct mutation) and confirm it
     fails validation.
   - Send malformed JSON state/config and confirm the queued step fails with a
     readable note instead of crashing the queue.

---

## 11. Out of scope

- User-defined/managed tools stored in the database.
- A dedicated tool-run form with typed fields; tool input is `state` +
  `toolConfig` for now.
- Per-tool permissions or approvals.
- Tool versioning.
- Streaming Ollama output; the prompt tool waits for the complete answer.
