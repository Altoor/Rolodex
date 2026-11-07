# Implementation Plan: Todos Page, Time-of-Day Deadlines, and Generic Tool Results

## Overview

This plan covers two related features:

1. **A Todos page** where the user can create, edit, complete, and delete todos.
   Todos get a **do-by timestamp with a time-of-day** and the list is sorted by
   that timestamp. The `create_todo` and `update_todo` tools infer a do-by
   timestamp from the user's free-text request, including relative times such
   as "tomorrow at 15:00" or "Friday morning".
2. **A generic tool-result renderer** used wherever tool output is shown. The
   first renderer is an **interactive** todo renderer, so todos found or changed
   by a tool can be edited directly in the landing-page chain-of-thought
   (COT), not just viewed. The same rendering mechanism works on the tools
   page and can be extended for future tool outputs without changing the
   landing page or tools page.

The todo backend already exists (`todos` table and GraphQL CRUD), so most of the
work is adding the timestamp field, extending the tool outputs, building the
todos page, and adding the generic result-rendering layer.

## Assumptions and decisions

- A do-by value is a **timestamp with time zone**, not a date-only value. The
  database column and GraphQL field keep the name `doByDate` to match the
  feature name, but semantically it is an instant.
- An ISO 8601 timestamp such as `2026-11-08T17:00:00+01:00` is the canonical
  wire format. The UI uses `datetime-local` inputs and converts to/from ISO.
- `doByDate` is **nullable**. Existing todos without a due timestamp stay valid.
- When the user specifies a day but no time, the todo defaults to **23:59
  local time** on that day. When the user says "morning", "afternoon", or
  "evening" without a specific time, use 12:00, 17:00, or 20:00 respectively.
  These defaults are prompt instructions and can be adjusted in one place.
- Inferred timestamps are best-effort. The model must never invent a deadline;
  if the request does not imply a date or time, the todo keeps `null`.
- Default sort: incomplete todos first (earliest due timestamp first), then
  completed todos. A todo without a due timestamp sorts after dated todos in
  the same group. This makes overdue items appear at the top.
- Tool output is a snapshot, but the todo renderer is interactive. Mutations
  update local renderer state and invalidate/refetch the todo list query so the
  Todos page and COT stay consistent.
- The generic renderer chooses a view by tool key first, then by output shape,
  and falls back to raw JSON. Future tools only need to add a renderer to the
  registry.

---

# Feature 1: Todos page with time-of-day deadlines

## 1.1 Database: add the do-by timestamp

**File:** `apps/backend/src/db/schema.ts`

Add a nullable timestamp column to the `todos` table:

```ts
export const todos = pgTable(
  "todos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    done: boolean("done").default(false).notNull(),
    doByDate: timestamp("do_by_date", { withTimezone: true }),
    authorId: integer("author_id").notNull(),
    actorId: integer("actor_id").notNull(),
    descriptionEmbedding: vector("descriptionEmbedding", {
      dimensions: 768,
    }),
  },
  // ...existing index
);
```

`timestamp` is already imported from `drizzle-orm/pg-core`.

Create and apply the migration with the repository's existing drizzle workflow:

```sh
pnpm --filter backend generate
```

The generated migration should contain:

```sql
ALTER TABLE "todos" ADD COLUMN "do_by_date" timestamp with time zone;
```

Apply it with the existing dev workflow (`pnpm --filter backend push`, or the
project's normal migration apply command).

No backfill is required because the column is nullable.

**Optional:** add an index on `do_by_date` if the todo list grows large. This is
not necessary for a personal todo list and can be skipped initially.

## 1.2 GraphQL API: expose and accept the timestamp

### Todo type

**File:** `apps/backend/src/schema/todo/todo.ts`

Expose the timestamp with the existing `DateTime` scalar:

```ts
export const Todo = builder.drizzleObject("todos", {
  name: "Todo",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    done: t.exposeBoolean("done"),
    description: t.exposeString("description"),
    doByDate: t.field({
      type: "DateTime",
      nullable: true,
      resolve: (parent) =>
        parent.doByDate ? new Date(parent.doByDate) : null,
    }),
    authorId: t.exposeInt("authorId"),
    actorId: t.exposeInt("actorId"),
  }),
});
```

The `DateTime` scalar is already registered in
`apps/backend/src/schema/builder.ts` and is used by `QueuedTask.queued_at`, so
this follows the existing pattern.

### Queries

**File:** `apps/backend/src/schema/todo/todo-queries.ts`

Sort `getTodos` by completion, then by do-by timestamp, then by id:

```ts
return db.query.todos.findMany({
  where: {
    OR: [{ actorId: userId }, { authorId: userId }],
  },
  orderBy: (todos, { asc }) => [
    asc(todos.done),
    asc(todos.doByDate),
    asc(todos.id),
  ],
});
```

PostgreSQL places `NULL` values last for ascending order by default, so
undated todos appear after dated ones. The backend sort is intentional; the
frontend also groups active/completed items, but it should not need to re-sort
the active group.

### Mutations

**File:** `apps/backend/src/schema/todo/todo-mutations.ts`

Add an optional `doByDate` argument to both create and update. Because the
argument uses the `DateTime` scalar, the resolver receives a `Date | null`:

```ts
createTodo: t.drizzleField({
  type: Todo,
  args: {
    name: t.arg.string({ required: true }),
    description: t.arg.string({ required: false }),
    doByDate: t.arg({ type: "DateTime", required: false }),
    actor_id: t.arg.int({ required: false }),
  },
  // ...
}),
```

For create:

```ts
const todo = {
  name,
  description: description ?? "",
  done: false,
  doByDate: doByDate ?? null,
  authorId: author_id,
  actorId: actor_id ?? author_id,
};
```

For update:

```ts
const todoDto = {
  name: name ?? todo.name,
  description: description ?? todo.description,
  authorId: todo.authorId,
  actorId: actor_id ?? todo.actorId,
  done: todo.done,
  ...(doByDate !== undefined ? { doByDate } : {}),
};
```

Because the argument is omitted when the client does not send it, existing
behaviour is preserved. Sending an explicit `null` clears the timestamp.

`markTodoDone` already spreads the existing todo row, so it will preserve
`doByDate` automatically. Verify that it still does after the schema change.

## 1.3 Tools: infer a do-by timestamp

### Shared timestamp helper

Create **`apps/backend/src/tools/todo/date.ts`**:

```ts
import { ToolInputError } from "../types";

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Validates an ISO 8601 date-time string. Empty strings and "none" mean
 * "no due date". Returns null for an explicitly cleared value and throws for
 * invalid input.
 */
export function parseTodoDateTime(
  value: string | null | undefined,
): Date | null {
  if (value == null) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return null;

  if (!ISO_DATE_TIME.test(trimmed)) {
    throw new ToolInputError(
      `"doByDate" must be an ISO 8601 date-time with a time-of-day`,
    );
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new ToolInputError(`"doByDate" is not a valid date-time`);
  }

  return date;
}

/** Local date-time string used in prompts, e.g. 2026-11-07T14:22:00+01:00. */
export function nowForPrompt(now = new Date()): string {
  return now.toString();
}
```

The regex allows a local date-time without an offset, which `new Date()` treats
as local time. Values with `Z` or an offset keep their instant. The UI normally
sends `new Date(localInput).toISOString()`, so production values include `Z`.

### Extend todo field extraction

**File:** `apps/backend/src/tools/todo/todos.ts`

Extend the extraction result and JSON schema:

```ts
const todoFieldsFormat = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    doByDate: {
      type: "string",
      description:
        "Do-by timestamp as an ISO 8601 date-time, or an empty string when no due date/time can be inferred.",
    },
  },
  required: ["name", "description", "doByDate"],
};
```

Update `extractTodoFields` to return:

```ts
Promise<{ name: string; description: string; doByDate: Date | null }>
```

Add the current date/time and date-reasoning instructions to the prompt:

```text
Current local date and time is 2026-11-07T14:22:00+01:00 (Saturday).

Extract a todo name, description, and do-by timestamp from the user input
below. Resolve relative dates and times such as "today", "tomorrow at 15:00",
"next Friday", "in three days", or "this afternoon" to an absolute ISO 8601
timestamp using the current date and time.

Rules:
- Return an ISO 8601 timestamp with a time-of-day, for example
  2026-11-08T17:00:00+01:00.
- If a date is mentioned without a time, use 23:59 local time on that date.
- Map morning/afternoon/evening to 12:00/17:00/20:00 unless a more specific
  time is given.
- If the input does not imply a due date or time, return an empty string.
- Never invent a deadline.
- Return only JSON that matches the supplied schema.
```

Rules:

- If the caller supplied `doByDate` via tool config/state, validate it with
  `parseTodoDateTime` and use it as-is.
- Otherwise use the model's `doByDate`.
- If the model returns an invalid inferred timestamp, log a warning and store
  `null` rather than failing the whole create/edit operation.
- If the caller supplied an invalid timestamp explicitly, throw a
  `ToolInputError` so the user gets actionable feedback.

The existing early return for "name and description were already supplied" must
also account for the timestamp. If name/description are supplied but
`doByDate` is not, still run the prompt so the timestamp can be inferred.

### Standardize todo tool output

The code currently repeats the same return object in every todo tool. Add one
helper in `todos.ts` so all tool outputs use the same timestamp representation:

```ts
function toToolTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id,
    name: todo.name,
    description: todo.description,
    done: todo.done,
    doByDate: todo.doByDate?.toISOString() ?? null,
    authorId: todo.authorId,
    actorId: todo.actorId,
  };
}
```

Use `toToolTodo` in `create_todo`, `update_todo`, `mark_todo_done`, and in the
find tools. This gives the client an ISO string consistently instead of relying
on JSON serialization of a `Date`.

### Create todo tool

Add `doByDate` to `createTodoDefinition.inputSchema`:

```ts
doByDate: {
  type: "string",
  description:
    "Optional do-by timestamp as an ISO 8601 date-time. Inferred from the request when omitted.",
},
```

Use the extracted value when inserting:

```ts
const { name, description, doByDate } = await extractTodoFields(
  context.userId,
  context,
);

const [todo] = await db
  .insert(todos)
  .values({
    name,
    description,
    doByDate,
    done: false,
    authorId: context.userId,
    actorId: context.userId,
  })
  .returning();
```

Include `doByDate` in the returned todo object and in the summary when it is
present, for example:

```ts
summary: doByDate
  ? `Created todo "${name}" (due ${doByDate.toISOString()})`
  : `Created todo "${name}"`,
```

### Update todo tool

Add `doByDate` to `updateTodoDefinition.inputSchema`:

```ts
doByDate: {
  type: "string",
  description:
    "Optional new do-by timestamp as an ISO 8601 date-time. Pass an empty string to clear it. Inferred from the request when omitted.",
},
```

Update behaviour:

1. Read an explicit `doByDate` from the merged tool input.
2. If supplied, validate it with `parseTodoDateTime` (empty string clears it).
3. If not supplied, infer a timestamp from the request.
4. Only write fields that were explicitly supplied or inferred.
   A timestamp-only edit must not overwrite the todo's name or description with
   values invented by the model.

A clean way to do this is to add a small timestamp-only inference helper for
update, for example `extractTodoDateTime`, so the update prompt does not return
replacement name/description fields. Create can continue using the combined
field extraction because it needs all three values anyway.

Include the timestamp in the update result and summary just like create.

### Search and find tools

**Files:**

- `apps/backend/src/tools/todo/search.ts`
- `apps/backend/src/tools/todo/findTodo.ts`
- `apps/backend/src/tools/todo/findTodos.ts`
- `apps/backend/src/tools/todo/todos.ts`

Extend `TodoCandidate` with `doByDate: string | null` and include the column in
every vector/lexical select and every candidate mapping. Convert it with
`.toISOString()` when building candidates.

The tool output shapes become:

```ts
// find_todo
{
  todo: { id, name, description, done, doByDate },
  score,
  candidates: [{ id, name, description, done, doByDate, score }],
}

// find_todos
{
  todos: [{ id, name, description, done, doByDate, score }],
}

// create_todo / update_todo / mark_todo_done
{
  todo: { id, name, description, done, doByDate },
}
```

Optionally include the due timestamp in the decision-model selection criteria
in `selection.ts`, so requests like "mark the overdue dentist todo done" select
more reliably:

```ts
value: `${todo.description}. Due: ${todo.doByDate ?? "none"}. Done: ${
  todo.done ? "yes" : "no"
}`,
```

## 1.4 Queries package: todo operations

**New files:**

- `packages/queries/src/todos/todo-queries.ts`
- `packages/queries/src/todos/todo-mutations.ts`

Add a shared fragment and operations:

```ts
export const TODO_FIELDS = gql(/* GraphQL */ `
  fragment TodoFields on Todo {
    id
    name
    description
    done
    doByDate
    authorId
    actorId
  }
`);

export const GET_TODOS = gql(/* GraphQL */ `
  query GetTodos {
    getTodos {
      ...TodoFields
    }
  }
`);
```

Mutations:

```ts
export const CREATE_TODO = gql(/* GraphQL */ `
  mutation CreateTodo(
    $name: String!
    $description: String
    $doByDate: DateTime
    $actor_id: Int
  ) {
    createTodo(
      name: $name
      description: $description
      doByDate: $doByDate
      actor_id: $actor_id
    ) {
      ...TodoFields
    }
  }
`);
```

Also add `UPDATE_TODO`, `MARK_TODO_DONE`, and `DELETE_TODO`.

- `UPDATE_TODO` sends `id`, optional `name`, `description`, and `doByDate`.
- `MARK_TODO_DONE` sends `id` and `done`.
- `DELETE_TODO` sends `id` and selects the returned string.

The `DateTime` GraphQL scalar is represented as an ISO string in client
variables. The UI helpers convert `datetime-local` values to ISO before calling
the mutation.

After the backend schema is running, regenerate client types:

```sh
pnpm api            # in one terminal; codegen reads localhost:4000/graphql
pnpm codegen        # in another
pnpm --filter @repo/queries build
```

`@repo/ui` imports the compiled query package from `dist`, so the queries build
must run before the UI type check/build.

## 1.5 UI: route and navigation

**New file:** `apps/web/app/todos/page.tsx`

```tsx
import TodosPage from "@repo/ui/pages/todos";

export default function Page() {
  return <TodosPage />;
}
```

**File:** `packages/ui/src/components/headerMenu/headerMenu.tsx`

Add a nav entry:

```ts
{ href: "/todos", label: "Todos", requiresAuth: true },
```

Place it near `Main`/`Decisions` so the page is easy to find.

## 1.6 UI: checkbox primitive

The UI package does not currently have a checkbox component, but
`@base-ui/react/checkbox` is already installed.

**New file:** `packages/ui/src/components/ui/checkbox.tsx`

Create a small shadcn-style wrapper around `Checkbox.Root` /
`Checkbox.Indicator`, using the same `cn` and `data-slot` conventions as the
other UI primitives. The todo item can then make the checkbox visually large:

```tsx
<Checkbox
  checked={todo.done}
  onCheckedChange={(checked) => onToggle(todo, checked)}
  className="size-6"
  aria-label={todo.done ? `Mark ${todo.name} as not done` : `Mark ${todo.name} as done`}
/>
```

The default primitive size can stay small (`size-4`); the page overrides it
with `size-6` or `size-7` for the "big checkbox" requirement.

## 1.7 UI: todo components

**New directory:** `packages/ui/src/components/todo/`

Suggested components:

### `use-todo-actions.ts`

A shared hook used by both the Todos page and the interactive tool renderer:

```ts
const { markDone, updateTodo, deleteTodo, pendingIds } = useTodoActions({
  onUpdated: (todo) => {
    // update local list
  },
  onDeleted: (id) => {
    // remove from local list
  },
});
```

The hook wraps the Apollo mutations and uses `refetchQueries: [GET_TODOS]` so
separate views stay in sync. Keeping the mutation logic here means the COT
renderer is genuinely editable without duplicating CRUD code.

### `todo-form.tsx`

A reusable create/edit form with:

- name (`Input`, required)
- description (`Textarea`)
- do-by timestamp (`Input type="datetime-local"`)
- submit and cancel buttons
- loading state and field errors

Use `react-hook-form` for consistency with the rest of the UI package.
The form accepts an optional initial todo and an `onSubmit` callback.

Timestamp helpers live in `packages/ui/src/lib/todo-date.ts`:

```ts
// ISO -> value for <input type="datetime-local">
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// <input type="datetime-local"> -> ISO for GraphQL / tool input
export function fromDateTimeLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
```

### `todo-item.tsx`

Use the existing `Item` primitives from
`packages/ui/src/components/ui/item.tsx` so each todo is literally an item:

```tsx
<Item variant={todo.done ? "muted" : "outline"}>
  <ItemMedia>
    <Checkbox
      checked={todo.done}
      onCheckedChange={(checked) => onToggle(todo, checked)}
      className="size-6"
    />
  </ItemMedia>

  <ItemContent>
    <ItemTitle className={todo.done ? "line-through text-muted-foreground" : ""}>
      {todo.name}
    </ItemTitle>
    <ItemDescription>{todo.description}</ItemDescription>
    <TodoDueBadge todo={todo} />
  </ItemContent>

  <ItemActions>
    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)}>
      <Pencil />
    </Button>
    <ConfirmButton title={`Delete ${todo.name}`} onConfirm={() => onDelete(todo)}>
      <Trash2 />
    </ConfirmButton>
  </ItemActions>
</Item>
```

When `editing` is true, replace the content/actions with the inline
`TodoForm`. Cancel returns to the read-only view.

The component should accept callbacks (`onToggle`, `onSave`, `onDelete`) rather
than owning Apollo directly. That makes it reusable in the todos page and in
the interactive tool renderer.

### `todo-due-badge.tsx` / date helpers

Add small helpers in `packages/ui/src/lib/todo-date.ts`:

- format the timestamp with `Intl.DateTimeFormat`, including both date and time;
- classify it as overdue / due soon / upcoming / none using
  `new Date(todo.doByDate).getTime()` and `Date.now()`;
- show a red/destructive badge when an incomplete todo is overdue;
- show a muted "No due date" state when the timestamp is null.

### `todo-list.tsx`

Render an `ItemGroup` and split by status:

- **Active** — every todo where `done === false`, in the order returned by
  `getTodos`.
- **Completed** — every todo where `done === true`, in the same timestamp
  order.

Show counts in the section headings and use `EmptyState` when both lists are
empty.

### `packages/ui/src/pages/todos.tsx`

Page structure:

```tsx
<AuthGate>
  <TodosPageContent />
</AuthGate>
```

`TodosPageContent`:

- loads `GET_TODOS` with Apollo;
- renders `PageHeader` with a short description;
- renders a create card/form;
- passes active/completed groups to `TodoList`;
- uses `useTodoActions` and passes the resulting handlers into `TodoItem`.

Per-item pending state:

- disable the checkbox and actions while a mutation for that todo is in flight;
- show the mutation error in the item or in a page-level error state;
- keep delete behind the existing two-step `ConfirmButton` so destructive
  actions are explicit.

## 1.8 Feature 1 acceptance checks

- The `/todos` page is reachable from the header.
- Creating a todo with a timestamp shows it in the correct sorted position.
- Creating a todo without a timestamp is allowed and sorts after dated active
  todos.
- The create form rejects an empty name and accepts a date plus time.
- The checkbox toggles `done` and the item moves to the completed group.
- Editing name, description, or do-by timestamp persists after refetch.
- Deleting asks for confirmation and removes the todo.
- Existing todos without timestamps still render and sort last.
- Overdue incomplete todos are visually distinguishable.
- The timestamp is displayed in the user's local time, not UTC.
- `getTodos` returns active items sorted by `doByDate` ascending, then undated
  items, then completed items.
- The `create_todo` tool resolves "tomorrow at 15:00" and "Friday morning" to
  an ISO timestamp and stores it correctly.
- The `update_todo` tool can move a todo's timestamp without changing its name
  or description.

---

# Feature 2: Generic, interactive tool results

## 2.1 Goal

Landing-page COT steps currently render tool output as raw JSON in a
`<details>` block, and the tools page does the same. That does not scale as
more tools and output types are added.

Introduce a **renderer registry**:

- `ToolResult` is the one component used wherever tool output is displayed.
- It picks a renderer by tool key first, then by output shape.
- If no renderer matches, it falls back to the raw JSON view.
- The first registered renderer is an **interactive todo renderer**.
- Future tools can add a renderer file and register it without changing the
  landing page, tools page, or any other result surface.

## 2.2 Backend output contract

Feature 1 adds `doByDate` as an ISO timestamp string to all todo tool output
objects. No additional GraphQL schema change is needed for rendering because
tool results are already exposed as JSON through:

- `ToolTestResult.output` (`testTool` mutation) for the tools page;
- `queuedTasks.result.output` for the landing page, live COT updates, and
  future result surfaces.

The `processToolStep` result already includes `toolKey`; the landing page's
`StepResult` interface must expose it so the generic renderer can choose by key:

```ts
interface StepResult {
  branch?: "result" | "fallback" | "tool" | "none";
  nextTaskId?: number | null;
  summary?: string;
  note?: string;
  toolKey?: string | null;
  output?: unknown;
}
```

Supported todo output shapes:

```ts
// find_todo
{ todo: TodoSummary; score?: number; candidates?: TodoSummary[] }

// find_todos
{ todos: TodoSummary[] }

// create_todo / update_todo / mark_todo_done
{ todo: TodoSummary }
```

where:

```ts
interface TodoSummary {
  id?: number | null;
  name?: string | null;
  description?: string | null;
  done?: boolean | null;
  doByDate?: string | null; // ISO 8601 timestamp
  score?: number | null;
}
```

## 2.3 Generic renderer architecture

**New directory:** `packages/ui/src/components/tool-results/`

Suggested files:

```text
tool-results/
  types.ts
  registry.tsx
  tool-result.tsx
  raw-result.tsx
  renderers/
    todo-result.tsx
```

### `types.ts`

```ts
export interface ToolResultRendererProps {
  output: unknown;
  toolKey?: string | null;
}

export interface ToolResultRenderer {
  id: string;
  match: (input: {
    output: unknown;
    toolKey?: string | null;
  }) => boolean;
  Component: React.ComponentType<ToolResultRendererProps>;
}
```

### `registry.tsx`

```tsx
export const toolResultRenderers: ToolResultRenderer[] = [
  todoToolResultRenderer,
];
```

Order matters. Key-specific renderers should generally come before
shape-based renderers.

### `tool-result.tsx`

```tsx
interface ToolResultProps {
  output: unknown;
  toolKey?: string | null;
  className?: string;
  showRaw?: boolean;
}

export function ToolResult({
  output,
  toolKey,
  className,
  showRaw = true,
}: ToolResultProps) {
  const renderer = toolResultRenderers.find((candidate) =>
    candidate.match({ output, toolKey }),
  );

  return (
    <div className={className}>
      {renderer ? (
        <renderer.Component output={output} toolKey={toolKey} />
      ) : (
        <RawResult output={output} />
      )}

      {renderer && showRaw ? (
        <RawResult output={output} collapsed />
      ) : null}
    </div>
  );
}
```

`RawResult` is the fallback and the optional "Raw output" disclosure. This
means every surface gets a safe default for unknown tools.

### Renderer matching

The todo renderer should match in two ways:

1. **By tool key**:
   `find_todo`, `find_todos`, `create_todo`, `update_todo`, `mark_todo_done`.
2. **By output shape**: an output object containing `todo`, `todos`, or
   `candidates` arrays with todo-shaped entries.

Key matching is preferred because it is explicit and cheap. Shape matching is
useful when a future tool returns todo data without a registered key.

## 2.4 Interactive todo renderer

**New file:**
`packages/ui/src/components/tool-results/renderers/todo-result.tsx`

The renderer is not display-only. It should:

- extract todos from the snapshotted tool output using
  `extractToolTodos(output)`;
- keep a local `TodoSummary[]` state seeded from that output;
- reset the local state when the underlying output changes (for example when a
  live COT event replaces the step);
- render the same `TodoItem` component used by the Todos page, with editing
  enabled;
- use the shared `useTodoActions` hook for toggle/update/delete;
- update its local item when a mutation returns the updated todo;
- remove the item from its local list after delete;
- refetch `GET_TODOS` so other views stay in sync;
- show an inline error if an item was deleted or changed elsewhere and the
  mutation fails.

Sketch:

```tsx
export function TodoToolResult({ output }: ToolResultRendererProps) {
  const extracted = useMemo(() => extractToolTodos(output), [output]);
  const [todos, setTodos] = useState(extracted);

  useEffect(() => {
    setTodos(extracted);
  }, [extracted]);

  const { markDone, updateTodo, deleteTodo, pendingIds } = useTodoActions({
    onUpdated: (todo) =>
      setTodos((current) =>
        current.map((item) => (item.id === todo.id ? todo : item)),
      ),
    onDeleted: (id) =>
      setTodos((current) => current.filter((item) => item.id !== id)),
  });

  if (todos.length === 0) return null;

  return (
    <TodoList
      todos={todos}
      editable
      pendingIds={pendingIds}
      onToggle={markDone}
      onSave={updateTodo}
      onDelete={deleteTodo}
    />
  );
}
```

`extractToolTodos` lives next to the renderer and handles:

- `output.todo` as a single item;
- `output.todos` and `output.candidates` as arrays;
- de-duplication by `id` (falling back to name + description);
- ignoring malformed entries and entries without a name;
- preserving `score` when present.

Because `TodoList` / `TodoItem` are shared with the Todos page, editing from the
COT supports the full CRUD set: name, description, date/time, completion, and
deletion. Rendering a todo with no `id` should fall back to read-only because
there is nothing to mutate; normal tool outputs always include an id.

### Why local state is needed

The COT payload is a historical snapshot of a tool run. Refetching the query
does not change that historical output. Local state lets the rendered item
reflect an edit immediately while the mutation keeps the real todo in sync.
Refetching `GET_TODOS` keeps the Todos page current; local state keeps the COT
card current.

## 2.5 Landing page integration

**File:** `packages/ui/src/pages/landing.tsx`

Replace the custom todo handling with the generic renderer. The key change is
that `ToolResult` is interactive and is not nested inside a collapsible raw
output block:

```tsx
{step.result?.output != null ? (
  <ToolResult
    className="ml-6 mt-1"
    toolKey={step.result.toolKey}
    output={step.result.output}
  />
) : null}
```

Add `toolKey` to the local `StepResult` interface. The backend already stores
it in `processToolStep`.

This covers:

- the landing page's historical run list;
- live steps delivered through the queue subscription;
- any future COT surface that renders `QueuedTaskStep.result.output`.

No `ToolTodoResult`-specific branch should remain in `landing.tsx`.

## 2.6 Tools page integration

**File:** `packages/ui/src/components/tools/toolCard.tsx`

Use the same generic component in the test result section:

```tsx
{data?.testTool ? (
  <div className="flex flex-col gap-2">
    <p className="text-sm font-medium">Result</p>
    <p className="text-sm text-muted-foreground">
      {data.testTool.summary}
    </p>

    <ToolResult
      toolKey={tool.key}
      output={data.testTool.output}
    />
  </div>
) : null}
```

`ToolResult` renders the interactive todo items when appropriate and falls
back to raw JSON for all other tools.

## 2.7 Adding future renderers

To support a new output type:

1. Add a renderer component under
   `packages/ui/src/components/tool-results/renderers/`.
2. Give it a `match` function based on tool key and/or output shape.
3. Add it to `toolResultRenderers` in `registry.tsx`.
4. Optionally reuse the same component anywhere else that output appears.

The landing page and tools page do not need to change. This is the extension
point for future tools and non-todo outputs.

## 2.8 Feature 2 acceptance checks

- Running `find_todo` on the tools page displays the matched todo with its
  timestamp and done state.
- Running `find_todos` displays every returned todo.
- Running `find_todo` with an explicit `id` displays the selected todo even
  though `candidates` is empty.
- Running `create_todo`, `update_todo`, or `mark_todo_done` displays the
  affected todo through the shared `{ todo }` shape.
- Todos rendered in the landing-page COT are fully editable:
  - toggle completion;
  - edit name and description;
  - edit the do-by date and time;
  - delete.
- Editing a todo in the COT updates the Todos page after the query refetch.
- Outputs with no matching renderer still show raw JSON and do not crash.
- Malformed or partial JSON does not crash the page; the extractor ignores
  invalid entries.
- Adding a new renderer requires only a renderer file plus a registry entry.

---

# Implementation order

1. **Backend data model**
   - add `doByDate` as `timestamp with time zone`;
   - generate/apply the migration.
2. **Backend GraphQL**
   - expose `doByDate` via the `DateTime` scalar;
   - accept it in create/update;
   - sort `getTodos`.
3. **Tool timestamp reasoning**
   - add `date.ts` helpers;
   - extend `extractTodoFields` and the create tool;
   - add timestamp inference to the update tool;
   - add `doByDate` to search/find outputs;
   - standardize tool todos with `toToolTodo`.
4. **Queries and codegen**
   - add todo query/mutation documents;
   - start the API and run codegen;
   - build `@repo/queries`.
5. **Todos page UI**
   - add checkbox primitive;
   - add timestamp helpers;
   - add `TodoForm`, `TodoItem`, `TodoList`, `useTodoActions`;
   - add the page, route, and nav entry.
6. **Generic tool-result layer**
   - add the renderer types and registry;
   - add `ToolResult` and the raw fallback;
   - add the interactive todo renderer;
   - integrate into the landing page;
   - integrate into the tools page.
7. **Verification**
   - run type checks, lint, and the manual checks from both feature sections.

# Files likely touched

## Backend

- `apps/backend/src/db/schema.ts`
- `apps/backend/drizzle/<new migration>/migration.sql`
- `apps/backend/src/schema/todo/todo.ts`
- `apps/backend/src/schema/todo/todo-queries.ts`
- `apps/backend/src/schema/todo/todo-mutations.ts`
- `apps/backend/src/tools/todo/todos.ts`
- `apps/backend/src/tools/todo/findTodo.ts`
- `apps/backend/src/tools/todo/findTodos.ts`
- `apps/backend/src/tools/todo/search.ts`
- `apps/backend/src/tools/todo/date.ts` (new)
- `apps/backend/src/tools/todo/selection.ts` (optional)

## Queries package

- `packages/queries/src/todos/todo-queries.ts` (new)
- `packages/queries/src/todos/todo-mutations.ts` (new)
- generated files under `packages/queries/src/__generated__/`

## Web app

- `apps/web/app/todos/page.tsx` (new)
- generated files under `apps/web/src/__generated__/` if the web app has local
  documents

## UI package

- `packages/ui/src/components/ui/checkbox.tsx` (new)
- `packages/ui/src/components/todo/use-todo-actions.ts` (new)
- `packages/ui/src/components/todo/todo-form.tsx` (new)
- `packages/ui/src/components/todo/todo-item.tsx` (new)
- `packages/ui/src/components/todo/todo-list.tsx` (new)
- `packages/ui/src/components/todo/todo-due-badge.tsx` (new)
- `packages/ui/src/components/tool-results/types.ts` (new)
- `packages/ui/src/components/tool-results/registry.tsx` (new)
- `packages/ui/src/components/tool-results/tool-result.tsx` (new)
- `packages/ui/src/components/tool-results/raw-result.tsx` (new)
- `packages/ui/src/components/tool-results/renderers/todo-result.tsx` (new)
- `packages/ui/src/lib/todo-date.ts` (new)
- `packages/ui/src/pages/todos.tsx` (new)
- `packages/ui/src/components/headerMenu/headerMenu.tsx`
- `packages/ui/src/pages/landing.tsx`
- `packages/ui/src/components/tools/toolCard.tsx`

# Verification commands

```sh
# after backend schema changes
pnpm --filter backend generate

# with the API running for GraphQL codegen
pnpm api
pnpm codegen

# build order matters because UI imports package dist output
pnpm --filter @repo/queries build
pnpm --filter @repo/ui check-types
pnpm check-types
pnpm lint
```

# Risks / things to watch

- **Timezone display:** timestamps are stored as `timestamptz` and returned as
  ISO strings. Always convert through `Date` and display with
  `Intl.DateTimeFormat` in the user's local timezone. Never parse the timestamp
  as a date-only string.
- **Model time quality:** the model can return a plausible but wrong timestamp.
  The prompt should strongly prefer `null` over invention, and explicit
  user-supplied timestamps must always win.
- **Tool renderer state vs. historical output:** COT output is a snapshot.
  Interactive renderers must keep local state for display and refetch the
  authoritative query after mutations.
- **Renderer matching:** prefer explicit `toolKey` matching to avoid treating
  unrelated JSON as todo output. Shape matching is a fallback.
- **Existing update-tool semantics:** make sure timestamp inference does not
  accidentally rewrite a todo's name/description during a timestamp-only edit.
- **DateTime scalar codegen:** verify that the generated client type for
  `$doByDate` accepts the ISO string produced by the UI helpers. If the
  generated scalar is `any`, add a small typed wrapper or cast at the
  mutation call site rather than scattering `any` through components.
- **Package builds:** `@repo/ui` imports `@repo/queries` from `dist`. Rebuild
  the queries package after codegen, or run the dev task that watches it.
