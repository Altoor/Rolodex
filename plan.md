# Tools feature implementation plan

## Goal

Add a first-class **tools** system:

1. A tools page that shows information about every available tool and lets the
   user configure/test it.
2. Tasks with `type = "tool"` are actually executed by the queue processor.
3. Tools are configurable and chainable in `/task-queue`, the same way
   decisions are configurable in `/decisions` and `/task-queue`.
4. Implement these tools, **in this order**:
   1. `prompt` — prompt another LLM, wait for the answer, return it.
   2. `find_todo` — find a todo by name/description using vector similarity.
   3. `model_selector` — make the next tool/decision use a different model.
   4. `create_todo` — create a todo.
   5. `update_todo` — update a todo.
   6. `mark_todo_done` — mark a todo done or not done.
   7. `delete_todo` — delete a todo.

A todo has a `name` and a `description`. The existing `todos.content` column is
renamed to `todos.description` as part of this work; there is no second
description field. The `prompt` tool/helper must be reusable by the todo tools
so it can fill in a todo's `name` and description when they are not supplied
explicitly.

---

## Design decisions

- **Tools are code-defined, not database rows.** The tool registry is the
  single source of truth for tool metadata (`key`, `name`, `description`,
  input schema, examples). Tool implementations and their metadata live
  together.
- **Tasks reference a tool by key.** Add `toolKey` (nullable text) and
  `toolConfig` (nullable JSON) to `tasks`. `toolKey` is a stable identifier such
  as `prompt` or `find_todo`.
- **Tasks can specify two model roles.** Add nullable `model` (generation
  model) and `decisionModel` (System One decision model) to `tasks`.
  `model` is used by prompt-style tools and todo field extraction;
  `decisionModel` is used by decision tasks and todo selection.
- **Queued steps can override both model roles.** Add nullable `model` and
  `decisionModel` to `queuedTasks`. The `model_selector` tool writes
  `nextModel` or `nextDecisionModel` into the next queued step, which overrides
  the next task's configured model for that role.
- **Models are not stored in `toolConfig`.** `toolConfig` is static per-tool
  configuration. Models are execution context: they are inherited across the
  run and can be changed by `model_selector`. Moving them into `toolConfig`
  would break inheritance and make per-run overrides awkward. Tools may still
  accept `model` / `decisionModel` keys as explicit local overrides.
- **Generation tools fall back to the user's default generation model.**
  `prompt` and todo field extraction resolve their model as
  `toolConfig.model` → inherited queued/task `model` → `getModelForUser`.
  They do not silently use the decision default.
- **Decision tools fall back to the user's default decision model.** Decision
  tasks and todo selection resolve their model as `toolConfig.decisionModel` →
  inherited queued/task `decisionModel` → `getDecisionModelForUser`. The
  decision default does not fall back to `defaultModelName`, because a
  generation model may not be a valid System One model.
- **Todo search uses local embeddings, not OpenAI.** Generate embeddings through
  the existing Ollama instance (`ollama.embed`) with an Ollama embedding model,
  e.g. `nomic-embed-text`, and store them in a pgvector column. Use
  `cosineDistance` from Drizzle. If embedding generation is unavailable, fall
  back to case-insensitive text search and then to the same System One decision
  model used by decision tasks.
- **Todo selection uses a decision model, not the prompt tool.** When a todo
  must be chosen for `find_todo`, `update_todo`, `mark_todo_done`, or
  `delete_todo`, build a choice question with one option per todo and call
  `ollama.systemone`, exactly like a decision task. Model precedence is
  `toolConfig.decisionModel` → queued/task `decisionModel` →
  `getDecisionModelForUser`. Do not ask `runPrompt` to return a todo id as
  free-form JSON. `runPrompt` is still used for structured todo-field
  extraction when a name/description is missing.
- **Tool input comes from two places:**
  1. The queued task's `state` string (what the user types on the landing page).
  2. The task's `toolConfig` JSON (defaults/fixed arguments).
     If `state` is valid JSON, its values override `toolConfig`. If `state` is
     plain text, tools use it as free-form input and/or use the `prompt` helper to
     extract structured fields from it.
- **Tool tasks continue through `fallbackTaskId`.** Tool tasks do not use
  `TaskResult` rows. For a tool task, the existing fallback edge is the normal
  "next task" edge. Tool execution can also return an explicit `nextTaskId`.
- **Tool output is stored in `queuedTasks.result`.** It has the same shape as a
  decision step plus a tool-specific `output` field, so the existing queue
  subscription/chain-of-thought UI can display it.
- **Tools can be tested directly.** Add a `testTool` GraphQL mutation that runs
  one tool with the current user context without going through the queue. The
  `/tools` page uses it. Tests that create/update/delete todos really modify
  data, so the UI must label the action clearly.

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

## 1. Backend tool runtime — DONE

Current file layout (after cleanup):

```text
apps/backend/src/tools/
  index.ts
  input.ts
  registry.ts
  types.ts
  modelSelector/modelSelector.ts
  prompt/prompt.ts
  todo/findTodo.ts
  todo/selection.ts
  todo/todos.ts
```

`todo/selection.ts` contains the shared decision-model todo selector used by
both `find_todo` and the todo CRUD tools.

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
  /** Stable identifier stored on tasks, e.g. "prompt" or "find_todo". */
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
  /**
   * Generation model inherited from the queued step or task, if any. May be
   * null; tools that call `runPrompt` fall back to the user's default.
   */
  model: string | null;
  /**
   * System One decision model inherited from the queued step or task, if any.
   * May be null; decision-based tools fall back to the user's decision default.
   */
  decisionModel: string | null;
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
  /** If set, the next queued step inherits this generation model. */
  nextModel?: string | null;
  /** If set, the next queued step inherits this decision model. */
  nextDecisionModel?: string | null;
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
- `TOOL_OUTPUT_START = "<<<TOOL_OUTPUT>>>"` and
  `TOOL_OUTPUT_END = "<<<END_TOOL_OUTPUT>>>"`.
  - Tools that need the next step to receive structured data append a
    delimited JSON block instead of replacing the whole state. This is
    important because state may already contain plain prompt text.
- `serializeToolOutput(value: Record<string, unknown>): string`
  - Return a string like
    `\n<<<TOOL_OUTPUT>>>\n{"todoId":3}\n<<<END_TOOL_OUTPUT>>>\n`.
- `extractToolOutput(state: string): Record<string, unknown> | null`
  - Find the last `TOOL_OUTPUT_START`/`TOOL_OUTPUT_END` pair and parse its
    contents as JSON. Return `null` when absent/invalid. Never throw.
- `mergeToolInput(context: ToolRunContext): Record<string, unknown>`
  - Start with `{ ...(context.config ?? {}) }`.
  - If `parseJsonObject(context.state)` is non-null, merge it on top so pure
    JSON state overrides config.
  - Then merge `extractToolOutput(context.state)` on top, so structured output
    appended by `find_todo` or another tool is visible to the next tool.
  - Do not put the raw plain-text state into the object; tools read
    `context.state` directly when they need free-form text.
- `readString(input, key): string | undefined`
- `readNumber(input, key): number | undefined`
- `readBoolean(input, key): boolean | undefined`
  - Validate the runtime type and throw `ToolInputError` with a clear message
    when a present value has the wrong type.
- `requireNonEmptyString(value, fieldName): string`
  - Throw `ToolInputError` when missing/blank.

### 1.3 Model helpers

**File:** `apps/backend/src/ai/model.ts` — `[NEW]` / `[REFACTOR]`

Move the existing `DEFAULT_MODEL` and `modelForUser` logic out of
`apps/backend/src/queue/processor.ts`:

```ts
export const DEFAULT_MODEL = "tev1:4b";
export const DEFAULT_DECISION_MODEL = DEFAULT_MODEL;

export async function getModelForUser(userId: number): Promise<string> {
  // Read userSettings.defaultModelName, fall back to DEFAULT_MODEL.
}

export async function getDecisionModelForUser(
  userId: number,
): Promise<string> {
  // Read userSettings.defaultDecisionModelName, fall back to
  // DEFAULT_DECISION_MODEL. Do not fall back to defaultModelName.
}

export async function assertPulledModel(name: string): Promise<void> {
  // Look up models.name; throw if the model is unknown or not pulled.
}
```

Then:

- **File:** `apps/backend/src/queue/processor.ts` — `[EDIT]`
  - Remove the local `DEFAULT_MODEL` constant and `modelForUser()` function.
  - Import `DEFAULT_MODEL` and `getModelForUser` from `../ai/model`.
  - Replace calls to `modelForUser(row.queued_by)` with
    `getModelForUser(row.queued_by)`.

The prompt tool falls back to `getModelForUser` when neither `toolConfig.model`
nor an inherited generation model is present. Decision tasks and todo selection
use `getDecisionModelForUser` instead.

### 1.4 FIRST TOOL: prompt

**File:** `apps/backend/src/tools/prompt/prompt.ts` — `[NEW]`

Export a reusable function and the tool object:

```ts
export interface PromptOptions {
  prompt: string;
  system?: string;
  model: string;
  format?: Record<string, unknown>;
}

export interface PromptResult {
  text: string;
  thinking?: string;
  model: string;
}

export async function runPrompt(options: PromptOptions): Promise<PromptResult>;
```

Implementation details:

- `model` is required and comes from the caller. `runPrompt` does not look up a
  default model.
- Call `ollama.generate({ model, prompt, system, format })` using the shared
  `ollama` instance from `apps/backend/src/ai/Ollama.ts`.
- Return `response.response` as `text`, `response.thinking` as `thinking` (if
  present), and the model name.
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
  - `model` (`string`): optional generation model override. It takes
    precedence over the inherited generation model.
  - `format` (`object`): optional JSON schema passed to Ollama for structured
    output.
- `outputDescription: "The model answer as text, plus the model name and optional thinking text."`
- `exampleConfig: { "model": "gemma4:e2b", "system": "You are a helpful assistant.", "appendState": true }`

`execute` behavior:

1. `const input = mergeToolInput(context)`.
2. `const prompt = readString(input, "prompt") ?? context.state`.
3. Throw `ToolInputError("prompt is required")` if both are blank.
4. `const model = readString(input, "model") ?? context.model ?? (await getModelForUser(context.userId))`.
5. Throw `ToolInputError("prompt tool requires a model")` only if the resolved
   value is blank.
6. Call `runPrompt({ prompt, system, model, format })`.
7. Return:

```ts
{
  output: { text, thinking, model },
  summary: text,
  stateAppend: text,
  // Prompt answers are normally useful to the next task.
  appendState: true,
}
```

### 1.5 SECOND TOOL: find_todo (vector search)

#### 1.5.1 Embedding helper

**File:** `apps/backend/src/ai/embeddings.ts` — `[NEW]`

Do **not** use the OpenAI package. Use Ollama's native `embed` API.

```ts
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? "nomic-embed-text";

export const EMBEDDING_DIMENSIONS = 768;

export function todoEmbeddingText(todo: {
  name: string;
  description: string;
}): string {
  return `${todo.name}\n\n${todo.description}`;
}

export async function embedText(text: string): Promise<number[]> {
  const response = await ollama.embed({
    model: EMBEDDING_MODEL,
    input: text,
  });

  const vector = response.embeddings[0];
  if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embedding model "${EMBEDDING_MODEL}" returned ${vector?.length ?? 0} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
    );
  }

  return vector;
}

export async function tryEmbedText(text: string): Promise<number[] | null> {
  try {
    return await embedText(text);
  } catch (err) {
    console.warn("todo embedding failed:", err);
    return null;
  }
}
```

`nomic-embed-text` produces 768-dimensional vectors. If the project switches
embedding models, update `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` together
and regenerate the vector column migration.

#### 1.5.2 find_todo tool

**File:** `apps/backend/src/tools/todo/findTodo.ts` — `[NEW]`

- Definition:
  - `key: "find_todo"`
  - `name: "Find todo"`
  - `description: "Find one of the user's todos by name/description using vector similarity, with lexical and decision-model fallbacks."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema properties:
    - `query` (`string`): optional search text; defaults to the queued state.
    - `id` (`number`): optional direct todo id.
    - `limit` (`number`): optional number of candidates, default `5`.
    - `decisionModel` (`string`): optional decision model used by the
      fallback selector; defaults to the task/inherited decision model, then
      the user's default decision model.
  - Output: `{ todo, score, candidates }`.
  - Example config:
    `{ "query": "pick up Johnny", "limit": 5 }`
- Execute:
  1. `const input = mergeToolInput(context)`.
  2. If `id`/`todoId` is present, load that user-owned todo (see shared
     `loadUserTodo` helper in `todo/todos.ts`) and return it with `score: 1`,
     `candidates: []`.
  3. `const queryText = readString(input, "query") ?? context.state`.
     Throw `ToolInputError("find_todo requires a query or state")` when blank.
  4. `const queryEmbedding = await tryEmbedText(queryText)`.
  5. If `queryEmbedding` is not null, run a vector query over the user's todos:
     ```ts
     import { and, eq, isNotNull, or, cosineDistance } from "drizzle-orm";

     const distance = cosineDistance(
       todos.descriptionEmbedding,
       queryEmbedding,
     );

     const rows = await db
       .select({
         id: todos.id,
         name: todos.name,
         description: todos.description,
         done: todos.done,
         distance,
       })
       .from(todos)
       .where(
         and(
           or(eq(todos.authorId, userId), eq(todos.actorId, userId)),
           isNotNull(todos.descriptionEmbedding),
         ),
       )
       .orderBy(distance)
       .limit(limit);
     ```
     Map `score = 1 - distance`. Keep the best row as the result and all rows as
     `candidates`. Select only the display fields (not the embedding) so tool
     output stays small.
  6. If there are no vector rows (embedding unavailable or no embeddings yet),
     fall back to case-insensitive text search on `todos.name` and
     `todos.description` using `ilike` and the same ownership filter.
  7. If the text search also returns no rows, resolve the model as
     `readString(input, "decisionModel") ?? readString(input, "model") ?? context.decisionModel ?? (await getDecisionModelForUser(userId))`,
     load all user todos, and call
     `selectTodoWithDecision(userTodos, queryText, model)` from
     `todo/selection.ts`. That helper builds a `choice` question with one
     option per todo plus a `none` option and calls `ollama.systemone` with the
     same decision model used by decision tasks. Do **not** use `runPrompt` for
     todo-id selection.
  8. If nothing matches, throw `ToolInputError("no matching todo found")`.
  9. Let `best` be the highest-scoring row. Return:
     ```ts
     {
       output: {
         todo: {
           id: best.id,
           name: best.name,
           description: best.description,
           done: best.done,
         },
         score: best.score,
         candidates,
       },
       summary: `Found todo "${best.name}"`,
       // Feed the selected todo into update_todo/delete_todo. Use the
       // delimited form so existing plain-text state is preserved.
       stateAppend: serializeToolOutput({
         todoId: best.id,
         todoName: best.name,
       }),
       appendState: true,
     }
     ```
- The returned `todoId` in the next state is consumed by `resolveTodoId` in the
  other todo tools, so a chain such as `find_todo -> update_todo` works without
  the user re-entering the id.

### 1.6 THIRD TOOL: model_selector

**File:** `apps/backend/src/tools/modelSelector/modelSelector.ts` — `[NEW]`

- Definition:
  - `key: "model_selector"`
  - `name: "Model selector"`
  - `description: "Choose the generation or decision model that the next tool or task should use."`
  - `category: "ai"`
  - `inputMode: "json"`
  - Input schema properties:
    - `model` (`string`, required): an installed/pulled Ollama model name.
    - `kind` (`string`): `"generation"` (default) or `"decision"`.
  - Output: `{ kind, model }`.
  - Example config: `{ "model": "tev1:4b", "kind": "decision" }`
- Execute:
  1. `const model = requireNonEmptyString(readString(mergeToolInput(context), "model"), "model")`.
  2. `const kind = readString(input, "kind") ?? "generation"`; validate against
     `generation | decision`.
  3. `await assertPulledModel(model)`.
  4. Return `nextModel: model` for generation, or
     `nextDecisionModel: model` for decision.
- The queue stores `nextModel` / `nextDecisionModel` on the next queued step.
  The next tool receives them as `context.model` / `context.decisionModel`; the
  next decision task uses `decisionModel` as its model override.
- This tool does not modify the task definition. To make the choice stick for a
  whole run, put the `model_selector` task before the tasks that need it and
  chain them with the fallback/next edge.

### 1.7 Fourth tool: create_todo

**File:** `apps/backend/src/tools/todo/todos.ts` — `[NEW]`

All todo CRUD tools live here so they can share helpers. They use the existing
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
  - `const input = mergeToolInput(context)`.
  - Read `name` and `description` from `input`.
  - If both are present, return them.
  - Otherwise resolve
    `const model = readString(input, "model") ?? context.model ?? (await getModelForUser(userId));`
    and throw `ToolInputError("todo extraction requires a model")` only when it
    is blank.
  - Call `runPrompt({ model, prompt, format })` with a prompt that asks for a
    structured `{ name, description }` from `context.state` (and any supplied
    partial fields). Pass an Ollama JSON `format` schema:
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
  - This uses the same generation-model fallback as the prompt tool: explicit
    tool config, then inherited generation model, then the user's default
    generation model.
  - Parse the JSON text. If parsing fails or fields are blank, throw
    `ToolInputError("could not determine todo name/description")`.
  - This is the requirement that lets the prompt helper fill in todo fields.
- `selectTodoWithDecision(userTodos, request, model)` — in
  `apps/backend/src/tools/todo/selection.ts`.
  - Builds one `choice` criterion per todo, keyed `todo:<id>`, with a `none`
    criterion for "no match".
  - Calls `ollama.systemone` with the same decision-model mechanism used by
    decision tasks. The answer's `choice` is a todo id, so no free-form JSON is
    parsed.
  - Throws `ToolInputError("no matching todo found")` for `none`,
    `ToolInputError("todo selection requires a model")` without a model, and a
    clear error if the returned id is not in the candidate list.
  - Shared by `find_todo` and `resolveTodoId`; this removes the duplicated
    prompt-based selection logic.
- `resolveTodoId(userId: number, context: ToolRunContext)`
  - Read an explicit `id`/`todoId` number from `mergeToolInput(context)`.
  - If present, call `loadUserTodo` and return it.
  - The delimited JSON state appended by `find_todo` contains
    `{ todoId, todoName }`, so a `find_todo -> update_todo`/`delete_todo` chain
    resolves automatically.
  - Otherwise load all user todos.
  - If there are no todos, throw `ToolInputError("no todos found")`.
  - If there is exactly one, use it.
  - Otherwise resolve the model as
    `readString(input, "decisionModel") ?? readString(input, "model") ?? context.decisionModel ?? (await getDecisionModelForUser(userId))`
    and call `selectTodoWithDecision(userTodos, context.state, model)`. This
    mirrors decision-task model precedence: explicit tool config, then the
    queued step/task decision model, then the user's default decision model.
  - This helper is not duplicated code from `find_todo`: `find_todo` performs
    vector/lexical search and returns candidate metadata, while `resolveTodoId`
    targets exactly one todo for mutations. Both share the explicit-id lookup
    and decision selector, but keep their distinct selection semantics.
  - Return the selected todo.
- `saveTodoWithEmbedding` helper:
  - After inserting or updating the todo's name/description, generate the
    embedding with `tryEmbedText(todoEmbeddingText(todo))` and update
    `descriptionEmbedding`.
  - If embedding generation fails, leave the embedding null and log a warning;
    todo CRUD must still succeed.
  - Use this helper from `create_todo`, `update_todo`, and the existing GraphQL
    todo mutations (`createTodo`, `updateTodo`).

#### create_todo tool

- Definition:
  - `key: "create_todo"`
  - `name: "Create todo"`
  - `description: "Create a todo. Name and description are taken from toolConfig, JSON state, or inferred from the state with the prompt helper."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema: optional `name` (`string`), optional `description`
    (`string`), optional `model` (`string`, generation model used for
    prompt-assisted extraction when name/description are missing; defaults to
    the user's default generation model).
  - Output: the created `Todo`.
  - Example config: `{ "name": "Pick up Johnny from daycare", "description": "Pick him up this afternoon." }`
- Execute:
  1. `extractTodoFields(context.userId, context)`.
  2. Insert into `todos`:
     ```ts
     {
       name,
       description,
       done: false,
       authorId: context.userId,
       actorId: context.userId,
     }
     ```
  3. `saveTodoWithEmbedding(createdTodo)`.
  4. Return `{ output: { todo }, summary: `Created todo "${name}"` }`.

### 1.8 Fifth tool: update_todo

**File:** `apps/backend/src/tools/todo/todos.ts` — same file as above.

- Definition:
  - `key: "update_todo"`
  - `name: "Update todo"`
  - `description: "Update a todo's name and/or description. The todo can be selected by id, by find_todo output, or inferred from state."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema: optional `id` (`number`), optional `name` (`string`),
    optional `description` (`string`), optional `model` (`string`, generation
    model used for prompt-assisted field extraction), optional `decisionModel`
    (`string`, decision model used to select the todo). Both default to the
    matching user setting.
  - Output: the updated `Todo`.
  - Example config: `{ "id": 3, "name": "Updated name", "description": "Updated description" }`
- Execute:
  1. `const todo = await resolveTodoId(context.userId, context)`.
  2. Read `name` and `description` from `mergeToolInput(context)`.
  3. If neither is supplied, call `extractTodoFields` and use those values.
  4. Update with `name ?? todo.name`, `description ?? todo.description`.
  5. `saveTodoWithEmbedding(updatedTodo)` because name/description changed.
  6. Return `{ output: { todo: updated }, summary: `Updated todo "${updated.name}"` }`.

### 1.9 Sixth tool: mark_todo_done

**File:** `apps/backend/src/tools/todo/todos.ts` — same file as above.

- Definition:
  - `key: "mark_todo_done"`
  - `name: "Mark todo done"`
  - `description: "Mark a todo as done or not done. The todo can be selected by id, by find_todo output, or inferred from state."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema: optional `id` (`number`), optional `done` (`boolean`,
    default `true`), optional `decisionModel` (`string`, decision model used to
    select the todo; defaults to the user's default decision model).
  - Output: the updated `Todo`.
  - Example config: `{ "id": 3, "done": true }`
- Execute:
  1. `const todo = await resolveTodoId(context.userId, context)`.
  2. `const done = readBoolean(mergeToolInput(context), "done") ?? true`.
  3. Update `{ done }`. No re-embedding needed.
  4. Return `{ output: { todo: updated }, summary: done ? `Marked todo "${updated.name}" as done`:`Marked todo "${updated.name}" as not done` }`.

### 1.10 Seventh tool: delete_todo

**File:** `apps/backend/src/tools/todo/todos.ts` — same file as above.

- Definition:
  - `key: "delete_todo"`
  - `name: "Delete todo"`
  - `description: "Delete a todo. The todo can be selected by id, by find_todo output, or inferred from state."`
  - `category: "todo"`
  - `inputMode: "json"`
  - Input schema: optional `id` (`number`), optional `decisionModel` (`string`,
    decision model used to select the todo; defaults to the user's default
    decision model).
  - Output: `{ id, name }` of the deleted todo.
  - Example config: `{ "id": 3 }`
- Execute:
  1. `const todo = await resolveTodoId(context.userId, context)`.
  2. Delete by `todo.id`.
  3. Return `{ output: { id: todo.id, name: todo.name }, summary: `Deleted todo "${todo.name}"` }`.

### 1.11 Add the tool registry

**File:** `apps/backend/src/tools/registry.ts` — `[NEW]`

- Import the tool objects.
- Keep one ordered array matching the implementation order:
  ```ts
  export const tools: Tool[] = [
    promptTool,
    findTodoTool,
    modelSelectorTool,
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
export * from "./prompt/prompt";
```

Do not re-export every todo helper unless needed. Embeddings live in
`apps/backend/src/ai/embeddings.ts`, not under `tools/`.

---

## 2. Database changes — DONE

### 2.1 Task columns

**File:** `apps/backend/src/db/schema.ts` — `[EDIT]` `[DB]`

In the `tasks` table definition, add:

```ts
toolKey: text("toolKey"),
toolConfig: json("toolConfig"),
model: text("model"),
decisionModel: text("decisionModel"),
```

All four are nullable so existing tasks keep working. `model` is the generation
model; `decisionModel` is the System One decision model. Do not add a `tools`
table; tool metadata comes from the code registry. Validate both models against
the `models` table in the GraphQL mutation (see 3.6).

### 2.2 Queued-task model overrides

**File:** `apps/backend/src/db/schema.ts` — `[EDIT]` `[DB]`

In the `queuedTasks` table definition, add:

```ts
model: text("model"),
decisionModel: text("decisionModel"),
```

These are the per-step overrides chosen by `model_selector` or by the task. They
stay null unless a model was selected/inherited.

### 2.2.1 User default decision model

**File:** `apps/backend/src/db/schema.ts` — `[EDIT]` `[DB]`

Add to `userSettings`:

```ts
defaultDecisionModelName: text("defaultDecisionModelName").references(
  () => models.name,
  { onDelete: "set null" },
),
```

Add the matching `defaultDecisionModel` relation in
`apps/backend/src/db/relations/relations.ts`. The existing
`defaultModelName` remains the default generation model; the new column is the
default System One decision model. It deliberately does not fall back to
`defaultModelName`.

### 2.3 Rename todo content to description and add embedding

**File:** `apps/backend/src/db/schema.ts` — `[EDIT]` `[DB]`

Change the `todos` table:

```ts
export const todos = pgTable("todos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description").notNull(), // renamed from content
  done: boolean("done").default(false).notNull(),
  authorId: integer("author_id").notNull(),
  actorId: integer("actor_id").notNull(),
  descriptionEmbedding: vector("descriptionEmbedding", {
    dimensions: 768,
  }),
});
```

- Import `vector` from `drizzle-orm/pg-core`.
- Add an HNSW index for cosine distance. In Drizzle:
  ```ts
  import { index } from "drizzle-orm/pg-core";

  export const todos = pgTable(
    "todos",
    {
      // columns as above
    },
    (table) => [
      index("todos_description_embedding_idx").using(
        "hnsw",
        table.descriptionEmbedding.op("vector_cosine_ops"),
      ),
    ],
  );
  ```
  If Drizzle's index generation gives trouble, add the raw SQL to the migration:
  ```sql
  CREATE INDEX IF NOT EXISTS todos_description_embedding_idx
    ON todos USING hnsw ("descriptionEmbedding" vector_cosine_ops);
  ```

### 2.4 Enable pgvector

**File:** `compose.yml` — `[EDIT]` `[DB]`

The original `postgres:18` image does not include pgvector. The dev compose
service now uses:

```yaml
postgres:
  image: pgvector/pgvector:pg18
```

Fresh development volumes also mount
`apps/backend/drizzle/init.sql` into `/docker-entrypoint-initdb.d/`, which runs:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

That init script is necessary because `drizzle-kit push` does not execute the
generated migration. If the deployment database already has pgvector installed,
only the migration extension statement is needed.

The migration must run this **before** adding the vector column:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Drizzle will not generate the extension statement automatically; prepend it to
the generated migration. This has been done for
`apps/backend/drizzle/20261106094218_lying_inertia/migration.sql`.

### 2.5 Generate and apply migrations

- Run from the repo root:
  - `pnpm --filter backend generate`
- Review the new migration under
  `apps/backend/drizzle/<new-timestamp>/migration.sql`.
- Ensure the final SQL includes, in this order:
  1. `CREATE EXTENSION IF NOT EXISTS vector;`
  2. `ALTER TABLE "todos" RENAME COLUMN "content" TO "description";`
     - If Drizzle generated a drop/add pair instead, replace it with the rename
       so existing todo data is preserved.
  3. `ALTER TABLE "todos" ADD COLUMN "descriptionEmbedding" vector(768);`
  4. The HNSW index.
  5. `ALTER TABLE "tasks" ADD COLUMN "toolKey" text;`
  6. `ALTER TABLE "tasks" ADD COLUMN "toolConfig" json;`
  7. `ALTER TABLE "tasks" ADD COLUMN "model" text;`
  8. `ALTER TABLE "tasks" ADD COLUMN "decisionModel" text;`
  9. `ALTER TABLE "queuedTasks" ADD COLUMN "model" text;`
  10. `ALTER TABLE "queuedTasks" ADD COLUMN "decisionModel" text;`
  11. `ALTER TABLE "userSettings" ADD COLUMN "defaultDecisionModelName" text;`
  12. The `defaultDecisionModelName → models.name` foreign key.
- Apply it using the project's existing workflow:
  - `pnpm --filter backend push` for a dev database, or the team's normal
    `drizzle-kit migrate` command if migrations are applied explicitly.
- Do not hand-edit a migration snapshot unless `generate` is unavailable. If it
  is unavailable, create the SQL migration manually and update the snapshot
  consistently.

### 2.6 Backfill existing todo embeddings

**File:** `apps/backend/src/scripts/backfillTodoEmbeddings.ts` — `[NEW]`

Add a one-off script that:

1. Starts with `import "dotenv/config";` so `DATABASE_URL` and
   `EMBEDDING_MODEL` are available.
2. Loads all todos where `descriptionEmbedding IS NULL`.
3. Builds `todoEmbeddingText({ name, description })`.
4. Calls `embedText` from `apps/backend/src/ai/embeddings.ts`.
5. Updates `todos.descriptionEmbedding`.
6. Logs progress and continues past individual failures.

Add a backend package script:

```json
"backfill-embeddings": "tsx src/scripts/backfillTodoEmbeddings.ts"
```

Run it once after pulling the embedding model:
`pnpm --filter backend backfill-embeddings`.

The app must still work without the backfill: `find_todo` falls back to lexical
search and the decision-model selector when no embeddings exist.

---

## 3. GraphQL changes — DONE

### 3.1 Tool objects

**File:** `apps/backend/src/schema/tool/tool.ts` — `[NEW]` `[GRAPHQL]`

- Import `ToolDefinition` from `../../tools/types` and `builder` from
  `../builder`.
- Create:
  ```ts
  export const Tool = builder.objectRef<ToolDefinition>("Tool").implement({
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
- Add a result type for direct tool tests:
  ```ts
  export interface ToolTestResultPayload {
    output: unknown;
    summary: string;
  }

  export const ToolTestResult = builder
    .objectRef<ToolTestResultPayload>("ToolTestResult")
    .implement({
      fields: (t) => ({
        output: t.field({
          type: "JSON",
          nullable: true,
          resolve: (parent) => parent.output ?? null,
        }),
        summary: t.exposeString("summary"),
      }),
    });
  ```

### 3.2 Tool queries

**File:** `apps/backend/src/schema/tool/tool-queries.ts` — `[NEW]` `[GRAPHQL]`

Add to `builder.queryType`:

- `tools: [Tool!]!`
  - Resolve with `listToolDefinitions()` from `../../tools/registry`.
  - Require a logged-in user with `requireUserId(ctx)`.
- `getTool(key: String!): Tool`
  - Resolve with `getToolDefinition(key)`.
  - Throw a `GraphQLError("Tool not found")` with `BAD_USER_INPUT` when missing.

### 3.3 Direct tool test mutation

**File:** `apps/backend/src/schema/tool/tool-mutations.ts` — `[NEW]` `[GRAPHQL]`

Add a `testTool` mutation used by the `/tools` page:

```ts
testTool: t.field({
  type: ToolTestResult,
  args: {
    key: t.arg.string({ required: true }),
    state: t.arg.string({ required: true }),
    toolConfig: t.arg({ type: "JSON" }),
    model: t.arg.string(),
    decisionModel: t.arg.string(),
  },
  resolve: async (
    _root,
    { key, state, toolConfig, model: modelArg, decisionModel: decisionArg },
    ctx,
  ) => {
    const userId = requireUserId(ctx);
    const tool = getTool(key);

    if (!tool) {
      throw new GraphQLError(`Unknown tool "${key}"`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const config = (toolConfig as Record<string, unknown> | null) ?? null;
    const model =
      modelArg ??
      (typeof config?.model === "string" ? config.model : null) ??
      (await getModelForUser(userId));
    const decisionModel =
      decisionArg ??
      (typeof config?.decisionModel === "string"
        ? config.decisionModel
        : null) ??
      (await getDecisionModelForUser(userId));

    const execution = await tool.execute({
      userId,
      runId: "test",
      taskId: -1,
      queuedTaskId: -1,
      state,
      config,
      model,
      decisionModel,
    });

    return { output: execution.output, summary: execution.summary };
  },
}),
```

- The optional `model` and `decisionModel` arguments override the user's
  defaults for this test run. The tools page exposes both fields.
- Tool errors are wrapped in `GraphQLError`; `ToolInputError` maps to
  `BAD_USER_INPUT` so the tools page can display the message.
- This bypasses the queue but uses the same tool code and the same user
  ownership rules.
- Tests that create/update/delete todos really change data. The UI must warn
  about that.
- If a tool throws, let the GraphQL layer surface the error message; the tools
  page displays it.

**File:** `apps/backend/src/schema/tool/index.ts` — `[NEW]`

```ts
export * from "./tool";
export * from "./tool-queries";
export * from "./tool-mutations";
```

**File:** `apps/backend/src/schema/index.ts` — `[EDIT]`

Add `import "./tool/index";` alongside the other schema imports.

### 3.4 Extend the Task GraphQL object

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
  model: t.exposeString("model", { nullable: true }),
  decisionModel: t.exposeString("decisionModel", { nullable: true }),
  tool: t.field({
    type: Tool,
    nullable: true,
    resolve: (parent) =>
      parent.toolKey ? getToolDefinition(parent.toolKey) : null,
  }),
  ```
- Keep the existing `type`, `decision`, `taskResults`, `fallbackTask` fields.
- Add both overrides to the `QueuedTask` GraphQL object:
  ```ts
  model: t.exposeString("model", { nullable: true }),
  decisionModel: t.exposeString("decisionModel", { nullable: true }),
  ```
  so the landing page can show which generation/decision model a step
  used/selected.

### 3.5 Extend task mutations

**File:** `apps/backend/src/schema/task/task-mutations.ts` — `[EDIT]` `[GRAPHQL]`

#### `createTask`

- Add arguments:
  ```ts
  toolKey: t.arg.string(),
  toolConfig: t.arg({ type: "JSON" }),
  model: t.arg.string(),
  decisionModel: t.arg.string(),
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
    model: model ?? null,
    decisionModel: decisionModel ?? null,
  }
  ```
- Remove the empty `switch (type)` block.
- Validate after building the object:
  - If `type === "tool"`, require `toolKey` and verify it exists with
    `getToolDefinition(toolKey)`. Throw `GraphQLError` with
    `BAD_USER_INPUT` when missing/unknown.
  - If `type !== "tool"`, allow `toolKey` to be omitted or null.
  - If `toolConfig` is present, require a JSON object (reject arrays and
    primitives).
  - If `model` or `decisionModel` is provided, call `assertPulledModel(...)`.
- A shared helper is recommended:
  ```ts
  async function assertValidTaskConfig(input: {
    type: string;
    toolKey: string | null;
    toolConfig?: unknown;
    model: string | null;
    decisionModel: string | null;
  }) {
    if (input.type === "tool") {
      if (!input.toolKey) {
        throw new GraphQLError("toolKey is required for tool tasks", ...);
      }
      if (!getToolDefinition(input.toolKey)) {
        throw new GraphQLError(`Unknown tool "${input.toolKey}"`, ...);
      }
    }
    if (
      input.toolConfig !== undefined &&
      input.toolConfig !== null &&
      (typeof input.toolConfig !== "object" || Array.isArray(input.toolConfig))
    ) {
      throw new GraphQLError("toolConfig must be a JSON object", ...);
    }
    for (const model of [input.model, input.decisionModel]) {
      if (model) {
        await assertPulledModel(model);
      }
    }
  }
  ```

#### `updateTask`

- Add arguments:
  ```ts
  toolKey: t.arg.string(),
  toolConfig: t.arg({ type: "JSON" }),
  model: t.arg.string(),
  decisionModel: t.arg.string(),
  ```
- Use explicit-null-aware merge semantics, like `fallbackTaskId`:
  ```ts
  toolKey: toolKey !== undefined ? toolKey : task.toolKey,
  toolConfig: toolConfig !== undefined ? toolConfig : task.toolConfig,
  model: model !== undefined ? model : task.model,
  decisionModel:
    decisionModel !== undefined ? decisionModel : task.decisionModel,
  ```
  This allows the UI to clear a model by sending `null`.
- Determine the effective type, tool key, tool config, and both models after the
  merge, then call `assertValidTaskConfig(...)`.
- Remove the empty `switch (type)` block.

### 3.5.1 User model settings

**File:** `apps/backend/src/schema/user/user-settings.ts` — `[EDIT]` `[GRAPHQL]`

- Expose `defaultDecisionModelName` (nullable string).
- Add a `defaultDecisionModel` relation.

**File:** `apps/backend/src/schema/user/user-settings-mutations.ts` — `[EDIT]` `[GRAPHQL]`

- Add `defaultDecisionModelName: t.arg.string()`.
- Pass it through to `updateUserSettings`.

**File:** `apps/backend/src/schema/user/user-settings-service.ts` — `[EDIT]`

- Add `defaultDecisionModelName` to `UpdateSettingsInput`.
- Validate that selected models exist and are pulled.
- Persist it with explicit-null-aware updates.

### 3.6 Rename todo content to description in GraphQL

**File:** `apps/backend/src/schema/todo/todo.ts` — `[EDIT]` `[GRAPHQL]`

Replace `content` with `description`:

```ts
export const Todo = builder.drizzleObject("todos", {
  name: "Todo",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    done: t.exposeBoolean("done"),
    description: t.exposeString("description"),
    authorId: t.exposeInt("authorId"),
    actorId: t.exposeInt("actorId"),
  }),
});
```

**File:** `apps/backend/src/schema/todo/todo-mutations.ts` — `[EDIT]` `[GRAPHQL]`

- In `createTodo`, rename the `content` argument to `description`.
- In `updateTodo`, rename the `content` argument to `description`.
- Replace all `content` DTO fields with `description`.
- When creating/updating, call the embedding helper from
  `apps/backend/src/ai/embeddings.ts`:
  - `createTodo`: after insert, compute embedding and update
    `descriptionEmbedding` (best effort).
  - `updateTodo`: when `name`/`description` changes, recompute the embedding.
  - Do not fail the mutation if embedding generation fails; log and leave the
    embedding null/old.
- `markTodoDone` and `deleteTodo` do not need embedding updates.

**File:** `apps/backend/src/schema/todo/todo-queries.ts` — `[EDIT]` (verify only)

No field name appears directly, because the query returns `Todo` objects.
Confirm type checking passes after the `Todo` field rename.

No other `content` references should remain in todo code. Search for
`todos.content`, `content:` in todo files, and `exposeString("content")` before
finishing.

This is an intentional breaking rename of the todo GraphQL field/arguments.
Update any client code or documentation that still uses `content`.

---

## 4. Queue execution for tool tasks — DONE

**File:** `apps/backend/src/queue/processor.ts` — `[EDIT]` `[QUEUE]`

### 4.1 Import the tool runtime

Add imports for `getTool`, `ToolInputError`, the shared tool config type, and
the generation/decision model helpers (`getModelForUser`,
`getDecisionModelForUser`).

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

### 4.3 Decision model precedence

In the decision branch, replace:

```ts
model = await modelForUser(row.queued_by);
```

with:

```ts
model =
  row.decisionModel ??
  task.decisionModel ??
  (await getDecisionModelForUser(row.queued_by));
```

So a decision model selected by `model_selector` (`row.decisionModel`) wins,
then the task's configured `decisionModel`, then the user's default decision
model as the last resort. Generation models are not used for decisions.

### 4.4 Add `processToolStep`

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
    const model =
      row.model ?? task.model ?? (await getModelForUser(row.queued_by));
    const decisionModel =
      row.decisionModel ??
      task.decisionModel ??
      (await getDecisionModelForUser(row.queued_by));

    const execution = await tool.execute({
      userId: row.queued_by,
      runId: row.runId,
      taskId: task.id,
      queuedTaskId: row.id,
      state: row.state,
      config: toolConfig,
      // Selector override > task model > user default, independently for each
      // model role.
      model,
      decisionModel,
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
      const append = execution.appendState ?? Boolean(toolConfig?.appendState);
      const nextState = append
        ? `${row.state}\n\n${execution.stateAppend ?? execution.summary}`
        : row.state;

      await db.insert(queuedTasks).values({
        taskId: nextTaskId,
        state: nextState,
        runId: row.runId,
        queued_by: row.queued_by,
        // model_selector sets nextModel/nextDecisionModel; otherwise keep the
        // inherited overrides.
        model: execution.nextModel ?? row.model,
        decisionModel: execution.nextDecisionModel ?? row.decisionModel,
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
  receives tool progress without changes. The subscription only streams events
  for the subscribed user's runs, and the landing page groups events by
  `runId`, so tool steps appear under the correct run.
- `toolConfig.appendState` is the generic opt-in for passing tool output to the
  next step. The prompt and find_todo tools opt in themselves via
  `execution.appendState = true`.
- Tool tasks with no `fallbackTaskId` finish the run (`nextTaskId = null`).
- `model_selector` returns `nextModel` for generation or `nextDecisionModel`
  for decision; the next queued row receives the matching field. The two roles
  are independent.

---

## 5. GraphQL documents in `packages/queries` — DONE

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

**File:** `packages/queries/src/tools/tool-mutations.ts` — `[NEW]` `[QUERIES]`

```ts
import { gql } from "../__generated__";

export const TEST_TOOL = gql(/* GraphQL */ `
  mutation TestTool(
    $key: String!
    $state: String!
    $toolConfig: JSON
    $model: String
    $decisionModel: String
  ) {
    testTool(
      key: $key
      state: $state
      toolConfig: $toolConfig
      model: $model
      decisionModel: $decisionModel
    ) {
      output
      summary
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
  model
  decisionModel
  tool {
    key
    name
    description
  }
  ```
- In `GET_TASK`, add the same fields.
- In `QUEUED_TASK`, add `model`, `decisionModel`, and `toolKey`:
  ```graphql
  model
  decisionModel
  task {
    id
    name
    type
    toolKey
  }
  ```
- `ACTIVE_QUEUED_TASKS` (`activeQueuedTasks`) powers the landing page's
  multi-run chain-of-thought and restores in-flight runs after a refresh. Keep
  its selection in sync with `QUEUED_TASK`, including `model`,
  `decisionModel`, and `toolKey`, so active runs display the same details as
  live subscription events.

**File:** `packages/queries/src/tasks/task-mutations.ts` — `[EDIT]` `[QUERIES]`

- `CREATE_QUEUED_TASK` selects the newly created step (`task`, `result`,
  `queued_at`, `model`, `decisionModel`) so the landing page can show the run
  immediately, before the processor emits its first subscription event.
- `CREATE_TASK`:
  - Add variables `$toolKey: String`, `$toolConfig: JSON`, `$model: String`,
    `$decisionModel: String`.
  - Pass the matching arguments to `createTask`.
  - Select `toolKey`, `toolConfig`, `model`, `decisionModel`, and
    `tool { key name description }`.
- `UPDATE_TASK`:
  - Same new variables and arguments.
  - Select `toolKey`, `toolConfig`, `model`, `decisionModel`, and
    `tool { key name description }`.

**File:** `packages/queries/src/tasks/task-subscriptions.ts` — `[EDIT]` `[QUERIES]`

- In `queuedTask.task`, add `toolKey`.
- Add `model` and `decisionModel` to `queuedTask` so the chain-of-thought can
  show which model was used/selected for each role.
- The backend already filters `queuedTaskEvent` to the current user's steps;
  no subscription document changes are needed for the multi-run COT.

### 5.4 User settings documents

**File:** `packages/queries/src/user/users-queries.ts` — `[EDIT]` `[QUERIES]`

- Add `defaultDecisionModelName` to the `settings` selection in `ME`.

**File:** `packages/queries/src/user/user-mutations.ts` — `[EDIT]` `[QUERIES]`

- Add `$defaultDecisionModelName: String` to `UpdateUserSettings`.
- Pass it to the mutation and select it in the result.

### 5.5 Regenerate generated GraphQL files

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

Do not hand-edit generated files. The typed documents must include `GetTools`,
`GetTool`, `TestTool`, and the new task/queued-task fields.

---

## 6. Tools page (frontend) — DONE

### 6.1 Tool card with info + test form

**File:** `packages/ui/src/components/tools/toolCard.tsx` — `[NEW]` `[UI]`

Create a card that both displays and tests a tool. Use the existing UI
primitives (`Card`, `CardContent`, `CardHeader`, `Badge`, `Separator`,
`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `Textarea`, `Input`,
`Button`, `Spinner`).

Props:

```ts
interface ToolCardProps {
  tool: NonNullable<GetToolsQuery["tools"]>[number];
}
```

Render:

- Tool `name` as `CardTitle`.
- `key` and `category` as `Badge`s.
- `description`.
- `inputMode` and `outputDescription`.
- Input fields from `inputSchema.properties`:
  - Mark required fields using `inputSchema.required`.
  - Show each property name, type, description, and enum/default when present.
- `exampleConfig` inside a `<pre>` with
  `JSON.stringify(exampleConfig, null, 2)`.
- A collapsible or bordered **Test tool** form:
  - `state` — `Textarea`, required.
  - `toolConfig` — `Textarea`, prefilled with the tool's `exampleConfig`
    pretty-printed, optional.
  - `model` — optional generation model override (`Input`); blank uses the
    user's default generation model.
  - `decisionModel` — optional decision model override (`Input`); blank uses
    the user's default decision model.
  - A warning: "Running a tool can create, update, or delete real data."
  - A "Run tool" button.
  - On submit:
    1. Parse the config text as a JSON object; reject arrays/null.
    2. Call `useMutation(TEST_TOOL)` with
       `{ key, state, toolConfig, model, decisionModel }`, sending null for
       blank model fields.
    3. Show the returned `summary` and pretty-printed `output`.
    4. Show `error.message` on failure.
  - Keep the loading state on the button (use `Spinner`).

### 6.2 Tools page

**File:** `packages/ui/src/pages/tools.tsx` — `[NEW]` `[UI]`

Follow the structure of `packages/ui/src/pages/models.tsx`:

- `"use client"`.
- Wrap the content in `AuthGate`.
- `const { data, error, loading } = useQuery(TOOLS)`.
- `const tools = data?.tools ?? []`.
- Render:
  - `PageHeader title="Tools" description="Inspect, configure, and test the tools that tool tasks can run."`
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

### 6.5 Account defaults for both model roles — DONE

This revision supersedes the earlier single-model wording throughout the plan.

**Decision:** models remain task/queued-step fields, not `toolConfig` entries.
`toolConfig` is static per-tool configuration, while models are execution
context that is inherited through a run and can be changed by `model_selector`.
Each role gets its own field:

- `model` — generation model used by `prompt` and todo field extraction.
- `decisionModel` — System One model used by decision tasks and todo selection.

**Database files:**

- `apps/backend/src/db/schema.ts` — add `tasks.decisionModel`,
  `queuedTasks.decisionModel`, `userSettings.defaultDecisionModelName`.
- `apps/backend/src/db/relations/relations.ts` — add
  `userSettings.defaultDecisionModel`.

**Backend runtime:**

- `apps/backend/src/ai/model.ts` — add `DEFAULT_DECISION_MODEL` and
  `getDecisionModelForUser`.
- `apps/backend/src/tools/types.ts` — add `decisionModel` to `ToolRunContext`
  and `nextDecisionModel` to `ToolExecution`.
- `apps/backend/src/queue/processor.ts`:
  - Decision tasks use `decisionModel`.
  - Tool steps resolve both roles and pass both to the tool.
  - Next steps inherit `execution.nextModel` / `execution.nextDecisionModel`.
- `apps/backend/src/tools/prompt/prompt.ts` — fall back to the user's default
  generation model.
- `apps/backend/src/tools/todo/*` — todo extraction uses the generation
  default; todo selection uses the decision default.
- `apps/backend/src/tools/modelSelector/modelSelector.ts` — add `kind`
  (`generation` | `decision`) and write `nextModel` or `nextDecisionModel`.
- `apps/backend/src/schema/tool/tool-mutations.ts` — `testTool` accepts optional
  `model` / `decisionModel` and resolves user defaults when omitted.

**UI files:**

- `packages/ui/src/components/auth/auth-provider.tsx` — include
  `defaultDecisionModelName` in `CurrentUser`.
- `packages/ui/src/pages/user.tsx` — pass the new setting and include it in the
  remount key.
- `packages/ui/src/components/user/user-settings-form.tsx` — add a second
  model select for the decision default.

---

## 7. Task queue UI for tool tasks

The goal is parity with decisions: a tool task can be created/configured in
`/task-queue`, selected as the starting task on the landing page, and chained to
other tasks through the flow editor.

### 7.1 Form values

**File:** `packages/ui/src/components/task/task-form.ts` — `[EDIT]` `[UI]`

Extend `TaskFormValues` with:

```ts
toolKey: string | null;
toolConfigText: string;
model: string | null;
decisionModel: string | null;
```

Update:

- `emptyTaskFormValues`:
  ```ts
  toolKey: null,
  toolConfigText: "",
  model: null,
  decisionModel: null,
  ```
- `taskToFormValues`:
  ```ts
  toolKey: task.toolKey ?? null,
  toolConfigText: task.toolConfig
    ? JSON.stringify(task.toolConfig, null, 2)
    : "",
  model: task.model ?? null,
  decisionModel: task.decisionModel ?? null,
  ```

Using a text field (`toolConfigText`) avoids react-hook-form needing nested
object validation; parse it only when saving.

### 7.2 Task builder save logic

**File:** `packages/ui/src/components/task/taskBuilder.tsx` — `[EDIT]` `[UI]`

- Add `useQuery(TOOLS)` and pass `data?.tools ?? []` to `TaskCard`.
- Add `useQuery(MODELS)` (existing model query from
  `@repo/queries/model/model-queries`) and pass only pulled model names to
  `TaskCard`, e.g.
  `models.filter((model) => model.pulled && model.name).map((model) => model.name)`
  (adjust to the generated query shape).
- Parse the JSON config when saving:
  ```ts
  let toolConfig: Record<string, unknown> | null = null;
  if (values.type === "tool" && values.toolConfigText.trim()) {
    try {
      const parsed = JSON.parse(values.toolConfigText);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("toolConfig must be a JSON object");
      }
      toolConfig = parsed;
    } catch {
      // set a form error / show ErrorState and abort the save
      return;
    }
  }
  ```
- Include in `taskVariables`:
  ```ts
  toolKey: values.type === "tool" ? values.toolKey : null,
  toolConfig,
  model: values.model || null,
  decisionModel: values.decisionModel || null,
  ```
- If `values.type === "tool"` and `values.toolKey` is empty, do not save; show
  a validation message.
- When creating a task, keep the existing behavior of placing `createdTaskId`
  and result task IDs.
- Only render the `DecisionList`/`DecisionBuilder` section when
  `values.type === "decision"` (use `watch("type")` or `getValues("type")`).
  For tool tasks, hide decision selection to avoid confusion.
- For tool tasks, show the selected tool's metadata. Reuse the info portion of
  `ToolCard` (or a shared `ToolDetails` component) so `/tools` and `/task-queue`
  show the same description/input schema/example config.

### 7.3 Task card

**File:** `packages/ui/src/components/task/taskCard/taskCard.tsx` — `[EDIT]` `[UI]`

- Add props:
  ```ts
  tools: Array<{
    key: string;
    name: string | null;
    description: string | null;
    inputSchema?: unknown;
    exampleConfig?: unknown;
  }>;
  models: string[];
  ```
- `const type = useWatch({ control, name: "type" })` already exists.
- Render two model `SelectController`s for all task types:
  - Generation model bound to `model`.
  - Decision model bound to `decisionModel`.
  - Each has "Use user default" (empty value) plus every model name.
  - For `type === "tool"` and `toolKey === "prompt"`, add helper text:
    "Prompt uses the generation model. Leave it empty to use your default."
- When `type === "tool"`, render:
  - A `SelectController` for `toolKey` with
    `rules={{ required: "select a tool" }}`. Options from `tools`.
  - A `Field` with a `Textarea` bound to `toolConfigText`, labeled
    "Tool config (JSON)".
  - `FieldDescription`: "Optional JSON. For example:
    `{\"id\": 3, \"done\": true}`. The queued task state is also passed to the
    tool."
  - The selected tool's `description`, input schema, and example config.
- Keep the existing results section only for `type === "decision"`.
- Import `Textarea` from `#components/ui/textarea` and `FieldDescription` from
  `#components/ui/field`.

### 7.4 Task flow display and chaining

**File:** `packages/ui/src/components/task/taskFlow/taskFlowTypes.ts` — `[EDIT]` `[UI]`

- Add `toolKey: string | null`, `model: string | null`, and
  `decisionModel: string | null` to `TaskFlowNodeData`.

**File:** `packages/ui/src/components/task/taskFlow/taskFlow.tsx` — `[EDIT]` `[UI]`

- When mapping tasks to node data, include:
  ```ts
  toolKey: task.toolKey ?? null,
  model: task.model ?? null,
  decisionModel: task.decisionModel ?? null,
  ```
- No edge changes are needed: tool tasks already get a fallback output handle,
  and that edge is the normal next-task edge for tools.

**File:** `packages/ui/src/components/task/taskFlow/taskFlowNode.tsx` — `[EDIT]` `[UI]`

- For tool tasks (`data.type === "tool"`), show the tool key/name near the
  task title, e.g. `Tool · find_todo`.
- For tool tasks, label the fallback handle "Next / fallback" so it is clear
  that connecting it chains the tool to the next step.
- Optionally show the configured generation/decision models when their fields
  are non-null.

### 7.5 Landing / run UI

**File:** `packages/ui/src/pages/landing.tsx` — `[EDIT]` `[UI]`

- The page now renders one chain-of-thought per run for the current user,
  grouped by `runId`. Active runs are seeded from `activeQueuedTasks` and kept
  fresh by the `queuedTaskEvent` subscription, so a refresh keeps in-flight
  runs visible and multiple queued runs appear side by side. Apply the
  following changes inside the per-run step loop.
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
- The queued-task subscription now includes `model` and `decisionModel`;
  optionally show them in the step detail so users can see which role changed.
- No new submission form is required: users select a tool task and type the
  free-text state as before. Model/tool arguments are configured on the task.

---

## 8. End-to-end examples

These examples should work after the changes.

### 8.1 Prompt with a task-level model

Task:

- `type: "tool"`
- `toolKey: "prompt"`
- `model: "gemma4:e2b"` (selected while setting up the task)
- `toolConfig: { "system": "You are a helpful assistant.", "appendState": true }`

Run with state:

> "Summarize this situation in one sentence."

The prompt tool uses the task's `model`; if neither it nor an inherited
generation model is set, it falls back to the user's default generation model.

### 8.2 Model selector → prompt/decision chain

Task 1:

- `type: "tool"`
- `toolKey: "model_selector"`
- `toolConfig: { "model": "tev1:4b", "kind": "decision" }`
- `fallbackTaskId: <task 2 id>` (next edge)

Task 2:

- `type: "decision"`.
- No decision model configured on the task.

Flow:

1. `model_selector` validates that `tev1:4b` is pulled.
2. Its result contains `nextDecisionModel: "tev1:4b"`.
3. The queue inserts the next step with `decisionModel: "tev1:4b"`.
4. The next decision task uses `row.decisionModel` as its model override.
   For a prompt tool, use `kind: "generation"` and `nextModel` instead.

### 8.3 Prompt → create todo chain

Task 1:

- `type: "tool"`
- `toolKey: "prompt"`
- `model: "gemma4:e2b"`
- `toolConfig: { "system": "Extract a todo name and description from the user text. Return JSON.", "appendState": true }`
- `fallbackTaskId: <task 2 id>`

Task 2:

- `type: "tool"`
- `toolKey: "create_todo"`
- `model: "gemma4:e2b"` (used by the prompt helper to infer fields)
- `toolConfig: {}`

Run with state:

> "I need to pick up Johnny from daycare this afternoon."

Flow:

1. The prompt task sends the state to Ollama and appends the answer to the
   next state.
2. The create-todo task calls `extractTodoFields`, which uses `runPrompt` to
   produce `{ name, description }`.
3. A todo is inserted with the current user as both `authorId` and `actorId`,
   and its embedding is generated.
4. The queue result for step 2 contains the created todo in `output`.

### 8.4 find_todo → update_todo / delete_todo chain

Task 1:

- `type: "tool"`
- `toolKey: "find_todo"`
- `toolConfig: { "query": "Johnny daycare" }`
- `fallbackTaskId: <task 2 id>`

Task 2:

- `type: "tool"`
- `toolKey: "update_todo"` or `"delete_todo"`
- `toolConfig: { "description": "Updated pickup note" }` for update, or `{}`
  for delete.

Flow:

1. `find_todo` embeds the query with the Ollama embedding model and ranks the
   user's todos by cosine distance.
2. It appends `{ "todoId": <id>, "todoName": "<name>" }` to the next state.
3. `update_todo` / `delete_todo` resolves the id from that JSON state, so the
   user does not re-enter it.

### 8.5 Direct create/update/mark/delete

- Create: `toolKey: "create_todo"`, `model: "gemma4:e2b"`, `toolConfig: {}`,
  state: "Buy milk and bread tonight."
- Update: `toolKey: "update_todo"`,
  `toolConfig: { "id": 3, "name": "Buy groceries", "description": "Milk, bread, eggs" }`
  (or JSON state `{ "id": 3, "description": "Milk, bread" }`).
- Done: `toolKey: "mark_todo_done"`,
  `toolConfig: { "id": 3, "done": true }`.
- Not done: `toolKey: "mark_todo_done"`,
  `toolConfig: { "id": 3, "done": false }`.
- Delete: `toolKey: "delete_todo"`, `toolConfig: { "id": 3 }`.

---

## 9. Error handling and validation rules

- Missing `toolKey` on a tool task → GraphQL validation error on save, and a
  failed queued step with a clear note if it somehow reaches the queue.
- Unknown `toolKey` → GraphQL validation error on save, failed queued step if
  it reaches the queue.
- Invalid `toolConfig` JSON in the UI → block the save and show an error.
- `toolConfig` must be a JSON object, not an array or primitive.
- `model` / `decisionModel` validation:
  - Task mutations validate that provided models exist and are pulled.
  - `model_selector` validates its selected model before updating the chain.
  - `prompt` and todo field extraction fall back to the user's default
    generation model when no explicit/inherited generation model is set.
  - Decision tasks and todo selection fall back to the user's default decision
    model. They never use the generation default.
- Missing/invalid tool input → throw `ToolInputError`; the queue catches it and
  marks the step `failed` with `note: "tool error: ..."`.
- Todo operations must always be limited to todos where
  `authorId === userId` or `actorId === userId`, same as the existing GraphQL
  todo mutations.
- Never let an unhandled tool error escape `processQueue`; the queue loop must
  keep processing later rows.
- `runPrompt` JSON output must be parsed defensively. If it is not valid JSON or
  does not contain the expected fields, throw a useful `ToolInputError`. This
  applies to todo-field extraction; todo selection uses a decision-model choice
  and must validate that the selected option belongs to the candidate list.
- Embedding failures must not break todo CRUD:
  - `tryEmbedText` catches and logs.
  - `find_todo` falls back to lexical search, then to the decision-model
    selector.
  - The backfill script is idempotent and skips todos that already have an
    embedding.

---

## 10. Verification checklist

Run these after implementation:

1. **Database / pgvector**
   - `compose.yml` uses `pgvector/pgvector:pg18`.
   - Fresh dev volumes mount `apps/backend/drizzle/init.sql`, which enables the
     `vector` extension before `drizzle-kit push` runs.
   - `pnpm --filter backend generate`
   - Review the generated SQL: extension, todo rename, vector column, indexes,
     task columns, queued-task model.
   - `pnpm --filter backend push` (or the project's migration command).
   - Confirm `todos.description`, `todos."descriptionEmbedding"`,
     `tasks."toolKey"`, `tasks."toolConfig"`, `tasks."model"`,
     `tasks."decisionModel"`, `queuedTasks."model"`,
     `queuedTasks."decisionModel"`, and
     `userSettings."defaultDecisionModelName"` exist.
2. **Embedding model**
   - Pull `nomic-embed-text` through the Models page or Ollama.
   - Run `pnpm --filter backend backfill-embeddings`.
3. **Type checks**
   - `pnpm exec tsc -p apps/backend/tsconfig.json --noEmit`
   - `pnpm --filter @repo/queries build`
   - `pnpm --filter @repo/ui build:components`
   - `pnpm --filter web check-types`
   - Root `pnpm check-types` if the workspace scripts are configured for it.
4. **Codegen**
   - Start the backend.
   - Run `pnpm --filter @repo/queries codegen`.
   - Confirm generated types include `GetTools`, `GetTool`, `TestTool`,
     `Task.toolKey`, `Task.toolConfig`, `Task.model`, `Task.decisionModel`,
     `Task.tool`, `QueuedTask.model`, `QueuedTask.decisionModel`, and
     `UserSettings.defaultDecisionModelName`.
5. **Tools page**
   - Visit `/tools`.
   - Confirm all seven tools appear with descriptions, input schemas, output
     descriptions, and example configs.
   - Test `model_selector` with a valid and invalid model, for both
     `generation` and `decision` kinds.
   - Test `prompt` with no model fields; confirm it uses the default generation
     model.
   - Test a todo mutation that needs field extraction with blank model fields;
     confirm it uses the default generation model.
   - Test a todo selection path with blank model fields; confirm it uses the
     default decision model instead of failing with "requires a model".
   - Test `find_todo` against existing todos; confirm it returns the expected
     todo.
   - Test `create_todo`, `update_todo`, `mark_todo_done` (both states), and
     `delete_todo`; confirm the data changes.
6. **Account defaults**
   - Visit `/user` and set both the generation and decision model defaults.
   - Confirm the settings persist after a refresh and are used by tool tests.
7. **Task builder / task queue**
   - Create a task with `type = Tool`, select each tool, select a generation
     model and a decision model, and save. Confirm `toolKey`, `toolConfig`,
     `model`, and `decisionModel` persist.
   - Create a `prompt` task without a generation model and confirm it uses the
     user's default generation model.
   - Chain a `model_selector` task with `kind: "decision"` to a decision task,
     and a `kind: "generation"` selector to a prompt task; confirm each next
     step uses the matching model.
   - Chain `find_todo` to `update_todo` and `delete_todo` via the flow's
     fallback/next edge and confirm the todo id is passed through state.
8. **Queue execution**
   - Run a `prompt` task from the landing page and confirm the answer appears
     in the chain-of-thought result.
   - Refresh the landing page while one or more runs are still queued/running
     and confirm every run is restored and continues updating from the
     subscription.
   - Run a `create_todo` task with free-text state and confirm a todo is
     created with a name and description and an embedding.
   - Confirm `update_todo` recomputes the embedding after name/description
     changes.
   - Confirm tool tasks chain through `fallbackTaskId`, and prompt output is
     appended to the next state.
9. **Failure cases**
   - Create a tool task without a tool key (via direct mutation) and confirm it
     fails validation.
   - Send malformed JSON state/config and confirm the queued step fails with a
     readable note instead of crashing the queue.
   - Run `find_todo` with the embedding model missing and confirm lexical /
     decision-model fallback still returns a result.

---

## 11. Out of scope

- User-defined/managed tools stored in the database.
- Per-tool permissions or approvals.
- Tool versioning.
- Streaming Ollama output; the prompt tool waits for the complete answer.
- An OpenAI/remote embedding provider. Embeddings stay local through Ollama.
