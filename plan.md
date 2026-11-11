# Plan: `display block`, `userDecision`, and forced user decisions

Date: 2026-11-11
Status: planning only — no implementation yet

## 0. Summary

This plan adds two capabilities:

1. **`display_block`** — a stateless, output-only **tool** that selects a fragment of `toolState` and renders it with the existing block registry. Starting with todos, but not todo-specific.
2. **`userDecision`** — a new **task type**, not a tool. It suspends a task flow on a user choice, supports predefined and tool-state-derived options, and uses the same choice UI as forced decision tasks.

It also changes decision tasks:

- Add **force user to decide if no match**, default **on**.
- When on, a decision that matches a result still auto-routes to that result's
  next task. Only when nothing matches does it present the decision's result
  outputs as a user choice instead of using the fallback.
- When off, a no-match decision uses its fallback as before.
- Waiting choices do **not** block other queued tasks.
- Waiting task flows stay visible in the COT until answered.

The central architectural recommendation is:

> `display_block` should be a tool because it is stateless and only produces presentation output.
> `userDecision` should be a task type because it is stateful, suspendable, and owns multiple control-flow outputs.

---

## 1. Current architecture relevant to this work

- Tasks are graph nodes with `TaskType = "decision" | "textPrompt" | "tool"`.
- Decision tasks call System One, match `taskResults`, and enqueue either a matching result's `resultTaskId` or `fallbackTaskId`.
- Tool tasks return a `ToolExecution`, which the processor turns into `result.output`, optional `toolState` changes, and a next task via `nextTaskId`, `branch`, or fallback.
- The queue loop only picks rows with `status = "queued"`; `running` rows are reset on restart.
- `activeQueuedTasks` currently treats only `queued`/`running` runs as active.
- The COT on `landing.tsx` renders active runs and their `result.output` through `Block`.
- Blocks are matched by `toolKey` or output shape.
- `filter_tool_state` and `if` already support an optional `path` selector for evaluating array items such as `find_todos`' `{ todos: [...] }`.

Key files:

- `packages/db/src/schema.ts`
- `apps/backend/src/queue/processor.ts`
- `apps/backend/src/queue/processors/decision-step.ts`
- `apps/backend/src/queue/step-store.ts`
- `apps/backend/src/schema/task/task/task-service.ts`
- `apps/backend/src/schema/task/queuedtask/*`
- `packages/tools/src/tools/toolState/filterToolState.ts`
- `packages/tools/src/tools/if/ifTool.ts`
- `packages/ui/src/pages/landing.tsx`
- `packages/ui/src/components/blocks/*`
- `packages/ui/src/components/task/taskBuilder/*`
- `packages/ui/src/components/task/taskFlow/*`

---

## 2. `display_block` tool

### 2.1 Goal

Given any accumulated `toolState`, select the entries/items that match a block definition and show them in the COT. The tool must not know about specific block types in the backend; it only selects data. The frontend block registry decides how to render it.

This is intentionally a tool, not a task type:

- It is stateless.
- It never waits for input.
- It only produces presentation output.
- It fits the existing tool lifecycle (`toolState` in, `output` out, next/fallback routing).

### 2.2 Tool contract

Add `packages/tools/src/tools/display/displayBlock.ts` and register it in `packages/tools/src/registry/registry.ts`.

Proposed config:

```json
{
  "path": "todos",
  "where": {
    "eq": { "path": "done", "value": false }
  },
  "block": "todo",
  "select": "all"
}
```

Input schema:

- `path?: string` — optional path to an array on each tool-state entry, e.g. `todos` or `result.todos`.
- `where?: WhereExpression` — same recursive language as `if`/`filter_tool_state`.
- `block?: string` — optional block id to force, e.g. `"todo"`. If omitted, the frontend auto-matches by output shape.
- `select?: "all" | "first"` — default `"all"`.

Selection semantics:

| `path`  | `where` | Behaviour                                                                   |
| ------- | ------- | --------------------------------------------------------------------------- |
| omitted | omitted | Select all tool-state entries.                                              |
| omitted | set     | Keep entries whose `where` matches.                                         |
| set     | omitted | Select all items in the array at `path`.                                    |
| set     | set     | Keep items in the array at `path` whose `where` matches; drop empty arrays. |

This reuses the recent `path` semantics from `filter_tool_state` and `if`. Extract the shared selection logic into a helper, for example `packages/tools/src/tools/toolState/services/selectToolState.ts`, so filtering and display cannot drift.

Example dynamic source from the user's `find_todos` state:

```json
{
  "path": "todos",
  "where": { "eq": { "path": "done", "value": true } },
  "block": "todo",
  "select": "all"
}
```

### 2.3 Output shape

```json
{
  "block": "todo",
  "items": [/* selected entries or array items */],
  "count": 1,
  "path": "todos"
}
```

- `block` is `null` when auto-matching.
- `items` is always an array, even for one result.
- The execution must set `appendOutput: false` and must not change `toolState`.
- Routing is the normal tool path: `nextTaskId` if explicitly set, otherwise the task's fallback/“Next” edge.

### 2.4 Frontend block rendering

Extend `BlockProps` in `packages/ui/src/components/blocks/block.tsx`:

```ts
interface BlockProps {
  output: unknown;
  toolKey?: string | null;
  blockId?: string | null;
  className?: string;
  showRaw?: boolean;
}
```

Add `blocksById` lookup in `packages/ui/src/components/blocks/registry.tsx`.

`Block` should special-case `toolKey === "display_block"`:

1. Parse `{ block, items }`.
2. Render each item through `Block` with `blockId={block ?? null}`.
3. Use the forced block id when present; otherwise use the normal `match` function.
4. If no block matches, render `RawBlock` for that item.

This keeps `display_block` generic: future blocks only need to be added to the registry, with no backend change.

Update `extractBlockTodos` in `todo-block.tsx` so a bare todo object also matches, not only `{ todo }` / `{ todos }` / `{ candidates }`. Forced block rendering passes individual items directly.

### 2.5 COT integration

`landing.tsx` already renders `step.result.output` through `Block`. No new COT component is required:

```tsx
<Block toolKey={step.result.toolKey} output={step.result.output} />
```

`Block` unwraps the `display_block` wrapper and delegates to the matched block. The tool's summary can say, for example, `Displayed 2 todos`.

### 2.6 Examples

Display all matching todos from `find_todos`:

```json
{ "path": "todos", "block": "todo" }
```

Display only open todos:

```json
{
  "path": "todos",
  "where": { "eq": { "path": "done", "value": false } },
  "block": "todo"
}
```

Display the single todo from `find_todo`:

```json
{
  "where": { "has": { "path": "todo.id" } },
  "block": "todo"
}
```

Display only the first match:

```json
{
  "path": "todos",
  "where": { "has": { "path": "id" } },
  "select": "first",
  "block": "todo"
}
```

### 2.7 Edge cases

- No matches: return `{ block, items: [], count: 0, path }` and a summary such as `No matching tool-state entries`. Frontend may show nothing or a small empty note.
- Unknown forced `block` id: frontend falls back to `RawBlock`; no backend failure.
- `path` points at a non-array: skip that entry (same as `filter_tool_state`).
- Nested paths such as `result.todos` must work.
- Legacy entry-level expressions such as `todo.done` must keep working when `path` is omitted.

### 2.8 Files and tasks

- [ ] Add shared `selectToolState` helper under `packages/tools/src/tools/toolState/services/`.
- [ ] Refactor `filter_tool_state` to use the helper without changing its public semantics.
- [ ] Add `displayBlock.ts` tool and register it.
- [ ] Add tests/scripts covering entry mode, item mode, `select: "first"`, empty matches, and nested paths.
- [ ] Extend `BlockProps`/`Block` for forced block id and `display_block` unwrapping.
- [ ] Add `blocksById` and bare-todo matching in `todo-block.tsx`.

---

## 3. `userDecision`: tool vs task type

### 3.1 Arguments for making it a tool

- Fits the existing tool pipeline: `toolKey`, `toolConfig`, `ToolExecution`, `toolState`, and output rendering.
- No `TaskType` enum migration.
- Could be inserted anywhere a tool can go.
- Tool definitions already appear on the tools page and are validated through `getToolDefinition`.
- Config is JSON and easy to evolve.
- A standalone choice that simply appends the selected value and continues could be modelled as a tool.

### 3.2 Arguments against a tool / for a task type

1. **The tool lifecycle is synchronous.** `processToolStep` awaits `tool.execute()` and expects a final `ToolExecution`. A user choice may take minutes or hours. A tool would need a new “suspend” return shape plus a resume protocol, which is effectively a second control-flow system hidden inside tools.
2. **Tools do not own multi-output control flow.** Tool routing currently supports `nextTaskId`, `true`/`false` branches, and fallback. A user choice needs N named outputs, each with its own target task, plus graph handles and edges. Encoding N task ids inside `toolConfig` duplicates `taskResults` and bypasses task-flow validation.
3. **Persistence and restart safety belong to queue rows.** A waiting choice needs a persisted row, a non-running status, a snapshot of the options, and a resume path. That is queue/task state, not tool input.
4. **Configuration is first-class in the task UI.** Choice type, labels, yes/no wording, static options, dynamic selectors, and per-option branch targets need typed GraphQL fields and form state. `toolConfig` is opaque JSON and would remain untyped and unvalidated by the task builder.
5. **Force user decide is a decision-task behavior.** Implementing it as a tool would split decision routing across two mechanisms: automatic `taskResults` matching and tool-based manual selection.
6. **Flow graph rendering already special-cases task types.** `TaskFlowNodeHandles` and `buildEdges` understand decision results and `if` branches. A userDecision task type can expose its options as handles; a tool would need the same special case plus a special tool contract.
7. **COT presentation already keys off task steps.** The queue row has `taskId`, `task.type`, and `result`. A task type can render the choice block directly on the waiting step.

### 3.3 Decision matrix

| Criterion                          | Tool                                    | New task type                     |
| ---------------------------------- | --------------------------------------- | --------------------------------- |
| Stateless execution                | Good                                    | N/A                               |
| Can wait for user without blocking | Needs new suspension protocol           | Native: `awaiting_input`          |
| Persists across process restart    | Would need extra state anyway           | Natural queue row                 |
| N named outputs with graph edges   | Poor fit                                | Natural                           |
| Typed config and validation        | Weak (`toolConfig` JSON)                | Strong                            |
| Reuses decision result routing     | No                                      | Yes                               |
| Implementation cost                | Lower initially, higher to make correct | Higher initially, cleaner overall |
| Fits force-user-decide             | Awkward                                 | Direct                            |

### 3.4 Recommendation

**Make `userDecision` a new task type.** Do not add it to `@repo/tools`.

Use a shared internal execution/resume path so standalone `userDecision` tasks and forced decision tasks produce the same normalized `pendingChoice` payload and use the same frontend choice component.

### 3.5 Rejected hybrid

A tool that returns `{ status: "awaiting_input" }` and is later resumed by the processor would require:

- a new `ToolExecution` suspension shape,
- tool-specific pending state,
- a tool-specific answer mutation,
- tool-specific routing for N outputs,
- and special cases in the flow graph.

At that point the “tool” is a task type with extra indirection. Reject it.

---

## 4. `userDecision` task type design

### 4.1 User-facing behaviour

A `userDecision` task runs and produces a choice. It then stops and waits. The COT shows a choice block for that step. The rest of the queue continues.

Supported choice types:

1. **Yes/No** — two buttons with editable wording.
2. **Select from list** — a list/grid of buttons; clicking an option answers immediately.
3. **Select from dropdown** — a select control plus an Accept button.

Options can be:

- **Predefined** on the task-queue page.
- **Dynamic**, selected from `toolState` with the same `path`/`where` semantics as `filter_tool_state`/`if`.

A dynamic option source may define one target task for all selected items. The selected item is appended to `toolState` so downstream tasks can act on it.

### 4.2 Data model

Add to `packages/db/src/schema.ts`:

```ts
export const userDecisionType = pgEnum("userDecisionType", [
  "yesNo",
  "list",
  "dropdown",
]);

export const userDecisionOptionKind = pgEnum("userDecisionOptionKind", [
  "static",
  "dynamic",
]);
```

Extend `tasks`:

```ts
forceUserDecideIfNoMatch: boolean("forceUserDecideIfNoMatch").default(true).notNull(),
userDecisionType: userDecisionType("userDecisionType")
  .default("list")
  .notNull(),
userDecisionConfig: json("userDecisionConfig"),
```

`userDecisionConfig` holds presentation-only data:

```json
{
  "prompt": "Which todo should I complete?",
  "acceptLabel": "Use selection",
  "yesLabel": "Yes",
  "noLabel": "No"
}
```

Add a new table rather than overloading `taskResults`. `taskResults` is tied to System One matching thresholds; userDecision options need labels, descriptions, dynamic selectors, and exactly one target.

```ts
export const userDecisionOptions = pgTable("userDecisionOptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  kind: userDecisionOptionKind("kind").default("static").notNull(),
  label: text("label"),
  description: text("description"),
  value: text("value"),
  // Dynamic source: same shape as filter_tool_state config.
  selector: json("selector"),
  labelPath: text("labelPath"),
  descriptionPath: text("descriptionPath"),
  valuePath: text("valuePath"),
  resultTaskId: integer("resultTaskId"),
  appendState: boolean("appendState").default(false).notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
});
```

Add relations:

- `tasks.userDecisionOptions` (many)
- `userDecisionOptions.task` (one)
- `userDecisionOptions.resultTask` (one task, alias)

Why a separate table instead of reusing `taskResults`:

- Static options need stable ids, ordering, labels, and descriptions.
- Dynamic sources need a selector and one shared target.
- Reusing `taskResults` would require nullable decision-only fields and synchronization between config JSON and result rows.
- The flow graph can render one handle per option row cleanly.

### 4.3 Task-queue configuration UI

Add `userDecision` to `TASK_TYPES` in `packages/ui/src/components/task/taskCard/taskCard.types.ts`.

Extend `TaskFormValues` and `taskToFormValues` with:

- `forceUserDecideIfNoMatch: boolean`
- `userDecisionType: "yesNo" | "list" | "dropdown"`
- `userDecisionConfig` fields
- `userDecisionOptions` form array

Add `UserDecisionFields` and `UserDecisionOptionsSection` under `packages/ui/src/components/task/taskCard/components/` and render them from `TaskCard` when `type === "userDecision"`.

UI sections:

- **Choice type** — yes/no, list, dropdown.
- **Prompt / accept label** — text fields.
- **Yes/No wording** — two text fields when `yesNo`.
- **Static options** — label, description, value, target task, append-to-tool-state.
- **Dynamic sources** — selector JSON, label path, description path, value path, target task, append-to-tool-state.

Follow the existing task-result pattern:

- `createUserDecisionOption`, `updateUserDecisionOption`, `deleteUserDecisionOption` GraphQL mutations.
- Shared `useLoadedEntity` / `useSaveEntity` hooks, not page-specific wrappers.
- Branch target select reuses `BranchTaskSelect` or a small generalization of it.

Dynamic selector validation should call the same `validateWhereExpression` used by the tools. The selector is exactly the filter config shape, for example:

```json
{
  "mode": "whitelist",
  "path": "todos",
  "where": { "has": { "path": "id" } }
}
```

For `yesNo`, create two static options with values `"yes"` and `"no"`; their labels come from `yesLabel`/`noLabel`. For `list` and `dropdown`, static options are free-form.

### 4.4 Runtime: creating a pending choice

Add `apps/backend/src/queue/processors/user-decision-step.ts` and dispatch it from `processor.ts` when `task.type === "userDecision"`.

Algorithm:

1. Load the task and its `userDecisionOptions` ordered by `sortOrder`, then `id`.
2. Build static options:
   - `id`: `static:<option.id>` (or `yes`/`no` for yes/no).
   - `label`: option label or value.
   - `description`: option description.
   - `value`: option value.
   - `resultTaskId`: option result target.
   - `appendState`: option flag.
3. Build dynamic options:
   - Evaluate the selector against `row.toolState` with the shared `selectToolState` helper.
   - Flatten matched items.
   - Label from `labelPath` (default `name`, then `label`, then `title`, then `id`).
   - Description from `descriptionPath`.
   - Value: the whole matched item. `valuePath` is only for display/logging.
   - `resultTaskId`: the dynamic source's target.
   - `appendState`: force `true` for dynamic **items** (a selector with `path`) so the next task can use the selection. Without a `path`, the selection is an existing entry, so use the option's flag to avoid duplicating it.
   - Deduplicate by `valuePath`/`id` when available.
4. If no options remain, finish the step with a clear note such as `user decision has no options for this run`.
5. Otherwise create a `pendingChoice` payload and move the row to `awaiting_input`; do **not** enqueue a next task yet.

Proposed `pendingChoice` payload stored on the queue row:

```json
{
  "kind": "userDecision",
  "taskId": 12,
  "prompt": "Which todo should I complete?",
  "choiceType": "list",
  "acceptLabel": "Use selection",
  "recommendedOptionId": null,
  "options": [
    {
      "id": "dynamic:3:0",
      "label": "Buy gift",
      "description": "for mormor",
      "value": { "id": 24, "name": "Buy gift", "done": false },
      "resultTaskId": 18,
      "appendState": true,
      "source": "dynamic"
    }
  ]
}
```

The client receives the option labels and values but never chooses the target task. The answer mutation only sends an option id; the server reads `resultTaskId` from its stored snapshot.

### 4.5 Answering and resuming

Add a GraphQL mutation:

```graphql
mutation AnswerUserDecision($queuedTaskId: Int!, $optionId: String!) {
  answerUserDecision(queuedTaskId: $queuedTaskId, optionId: $optionId) {
    id
    status
    result
  }
}
```

Service behaviour (`apps/backend/src/schema/task/queuedtask/user-decision-service.ts`):

1. `requireUserId(ctx)`.
2. In a transaction, load the row with a lock/conditional update.
3. Verify `queued_by === userId`.
4. Verify `status === "awaiting_input"` and `pendingChoice` exists.
5. Find the option by id in the stored snapshot. Never trust a client-supplied target.
6. Compute `nextToolState`:
   - If `option.appendState`, append `option.value`.
   - For forced decision outputs, append a normalized answer object including the selected result id.
7. Update the row:
   - `status = "completed"`.
   - `result = { ...previousResult, branch: "result", nextTaskId, selectedOptionId, answer, summary }`.
   - `pendingChoice = null`.
8. If `nextTaskId` exists and depth is below `MAX_CHAIN_DEPTH`, enqueue the next step with:
   - same `runId`,
   - same `state`,
   - computed `toolState`,
   - `depth + 1`,
   - `parentQueuedTaskId = answered row id`.
9. Publish the updated row, then `triggerQueue()`.
10. If the row is no longer awaiting input, return a `BAD_USER_INPUT` error such as `This choice has already been answered`.

Use a conditional update (`where id = ? and status = 'awaiting_input'`) so double-clicks and concurrent tabs cannot enqueue the next step twice.

### 4.6 Non-blocking queue semantics

- Add `awaiting_input` to the `queuedTaskStatus` enum.
- `findNextQueuedStep` continues to select only `queued`, so waiting rows never block other runs.
- `resetRunningSteps` continues to reset only `running`; waiting rows survive restarts.
- `activeQueuedTasks` must include `awaiting_input` when deciding which runs are active, so the COT still shows waiting runs.
- The `QUEUED_TASK_EVENT` subscription should include `pendingChoice`; answering publishes an update and the next step publishes normally.
- If the waiting row is deleted, the run simply stops; a future “cancel run” action can be added separately.

### 4.7 COT rendering

In `landing.tsx`:

- Extend `QueuedTaskStep.status` with `"awaiting_input"`.
- Add `pendingChoice` to `QueuedTaskRow`/`QueuedTaskStep`.
- Include `awaiting_input` in `run.pending`.
- Render `awaiting_input` as an active step with a waiting icon and description such as `waiting for your choice`.
- Render the shared choice component beneath the step, for example:

```tsx
{
  step.pendingChoice ? (
    <UserChoiceBlock
      choice={step.pendingChoice}
      onAnswer={(optionId) => answerUserDecision(step.id, optionId)}
    />
  ) : null;
}
```

Add `packages/ui/src/components/userDecision/userChoiceBlock.tsx`:

```ts
interface UserChoiceBlockProps {
  choice: PendingChoice;
  onAnswer: (optionId: string) => Promise<void> | void;
  answering?: boolean;
  error?: string | null;
}
```

Rendering rules:

- `yesNo`: two buttons using `yesLabel`/`noLabel`; click answers immediately.
- `list`: buttons or an item grid; click answers immediately.
- `dropdown`: `Select` plus an Accept button using `acceptLabel`.
- Show `prompt` and optional descriptions.
- Show a `recommended` badge when `recommendedOptionId` is set.
- Disable controls while `answering`.

The same component is used by forced decision tasks. That satisfies “the same components as the userDecision.”

Waiting steps remain in the COT until answered. Once answered, the step becomes completed and normal routing appears as new steps arrive.

### 4.8 Flow graph

Extend:

- `packages/queries/src/tasks/task-queries.ts` (`TASKS`, `GET_TASK`) with `forceUserDecideIfNoMatch`, `userDecisionType`, `userDecisionConfig`, and `userDecisionOptions`.
- `packages/ui/src/components/task/taskFlow/taskFlowTypes.ts` with the same fields.
- `TaskFlowNodeHandles`:
  - For `userDecision`, render one handle per option row, labeled with the option label (dynamic sources show their source label).
  - No fallback handle for `userDecision`; options own their targets.
  - For `decision` with `forceUserDecideIfNoMatch`, render result handles and hide the fallback handle.
- `buildEdges`:
  - Emit `e-udo-<optionId>` edges from `userDecisionOptions.resultTaskId`.
  - Suppress `fallbackTaskId` edges when `forceUserDecideIfNoMatch` is on or the task is `userDecision`.
- `connection.ts`:
  - Parse `udo:<id>` source handles to `{ kind: "userDecisionOption", optionId }`.
  - Parse `e-udo-<id>` edge ids.
- `useTaskFlowActions`:
  - On connect/edge delete, update `userDecisionOptions.resultTaskId` through a new mutation.
- `services/cache.ts`:
  - Add `setUserDecisionOptionResultInCache`.
- `computePositions`:
  - Follow `userDecisionOptions.resultTaskId` links; skip fallback for forced tasks.

### 4.9 Examples

**List of todos**

Task config:

```json
{
  "type": "userDecision",
  "userDecisionType": "list",
  "userDecisionConfig": {
    "prompt": "Which todo should I complete?"
  }
}
```

Dynamic option:

```json
{
  "kind": "dynamic",
  "labelPath": "name",
  "descriptionPath": "description",
  "valuePath": "id",
  "selector": {
    "mode": "whitelist",
    "path": "todos",
    "where": { "has": { "path": "id" } }
  },
  "resultTaskId": 18,
  "appendState": true
}
```

With the user's `find_todos` state this yields “get gas” and “Buy gift” as buttons. Selecting one appends that todo to `toolState` and continues to task 18.

**Yes/No**

```json
{
  "userDecisionType": "yesNo",
  "userDecisionConfig": {
    "prompt": "Mark this todo as done?",
    "yesLabel": "Yes, mark it done",
    "noLabel": "No, leave it"
  }
}
```

**Dropdown**

```json
{
  "userDecisionType": "dropdown",
  "userDecisionConfig": {
    "prompt": "Choose a model",
    "acceptLabel": "Use model"
  }
}
```

### 4.10 Edge cases

- No static or dynamic options: fail the step with a clear note; do not create an empty choice block.
- Duplicate dynamic items: deduplicate by `valuePath`/`id`.
- Dynamic item missing the label path: fall back to `id`, then `value`, then `"Option N"`.
- Option with no target: selecting it completes the run with a note such as `selection had no target task`.
- Task/option deleted while waiting: the stored snapshot still answers safely; validate the target exists before enqueueing, otherwise complete with a note.
- User changes task config while a run is waiting: the waiting snapshot is immutable; new runs use the new config.
- `yesNo` must have exactly two options; validate when options are saved or normalize from `yesLabel`/`noLabel`.
- Dynamic selectors that match nothing produce no dynamic options; the choice may still have static options.

---

## 5. Force user to decide if no match

### 5.1 Semantics

Add a boolean `forceUserDecideIfNoMatch` to decision tasks, default **true**.

When **on**:

- The task still runs System One to produce a recommendation and a COT summary.
- If the answer matches a result, that result's `resultTaskId` is queued
  automatically, exactly like a normal decision. `appendState` applies as usual.
- Only when nothing matches does it skip `fallbackTaskId` and create a
  `pendingChoice` whose options are the task's result outputs (results with a
  `resultTaskId`).
- Routing then uses the selected result: `resultTaskId`, `appendState`, and the
  normal next-step rules.
- The fallback handle is hidden in the flow graph and the fallback edge is not
  built, because that fallback is unreachable while the toggle is on.

When **off**:

- Existing behavior is unchanged: first matching result wins; otherwise
  fallback; otherwise the run stops.

### 5.2 Data and UI

- Add `forceUserDecideIfNoMatch` to `tasks`, GraphQL `Task`,
  `TASKS`/`GET_TASK`, task form values, and `createTask`/`updateTask`.
- Add a toggle in the decision task section, labeled
  `Force user to decide if no match`, default on.
- Keep result rows as the choice outputs.
- Show a short note: matched results auto-queue; a no-match run asks the user to
  choose between these result outputs; the fallback is hidden while on.
- Do not clear `fallbackTaskId` when the toggle turns on; hide and ignore it, so
  toggling off restores the previous configuration without data loss.

### 5.3 Runtime

In `processDecisionStep`:

1. Run System One as today.
2. Find the first matching result (type and thresholds) with a `resultTaskId`.
3. If a result matches, queue its target immediately, regardless of the
   toggle. Store `branch: "result"` and apply the result's `appendState`.
4. If no result matches and `task.forceUserDecideIfNoMatch`:
   - Build options from `taskResults` with `resultTaskId != null`.
   - Label each option with the same logic as `resultLabel`.
   - Store the model answer/usage when available.
   - Move the row to `awaiting_input` with
     `pendingChoice.kind = "decisionOutput"`.
   - Return without enqueueing and without `recommendedOptionId`, because there
     was no match.
5. If no result matches and the toggle is off, use `fallbackTaskId` as before.

When the user answers a no-match decision:

- The selected option carries the corresponding `TaskResult`.
- Route to its `resultTaskId`.
- Apply its `appendState`.
- Append a normalized answer representing the user's selected output:
  - For choice results, use the selected result's option as the chosen answer.
  - For score/noul results, keep the model score and add `selectedResultId`.
- Store `selectedBy: "user"` in the result payload for observability.

If System One fails while `forceUserDecideIfNoMatch` is on:

- Still show the choice options, because the user can decide without the model.
- Include a note such as `decision model failed; presenting manual choice`.
- Do not fail the step solely because the recommendation failed.

### 5.4 Flow graph and inference changes

- `TaskFlowNodeHandles`: hide the fallback handle when
  `data.forceUserDecideIfNoMatch` is true and `data.type === "decision"`.
- `buildEdges`: skip the fallback edge for those decision tasks.
- `computePositions`: skip fallback links for those decision tasks.
- Tool-state inference (`packages/ui/src/lib/toolStatePaths.ts`) also skips the
  fallback edge for those decision tasks.
- `connection.ts` / `useTaskFlowActions`: no change needed for result edges; they
  already update `TaskResult.resultTaskId`.

### 5.5 Edge cases

- No result with a target while the toggle is on: fail with a clear note such as
  `no matching result and no result output has a target task`.
- Only one result with a target: a match auto-routes; a no-match still asks.
- `fallbackTaskId` set while the toggle is on: ignored and hidden, not deleted.
- Toggling the setting while a run is waiting: the waiting snapshot keeps its
  options; only future runs change.
- Existing decision tasks: the column is renamed from `forceUserDecide`, so
  existing rows keep their previous choice with the new no-match meaning.

---

## 6. Cross-cutting backend changes

### 6.1 Queue status

Add `awaiting_input` to `queuedTaskStatus`:

```ts
export const queuedTaskStatus = pgEnum("queuedTaskStatus", [
  "queued",
  "running",
  "awaiting_input",
  "completed",
  "failed",
]);
```

Add `pendingChoice` JSON to `queuedTasks`:

```ts
pendingChoice: json("pendingChoice"),
```

`step-store.ts` additions:

```ts
export async function awaitStep(
  id: number,
  pendingChoice: unknown,
  result: unknown,
  message?: string,
): Promise<void>;
```

Only transition `running -> awaiting_input`; publish the updated row.

`resetRunningSteps` must not touch `awaiting_input`.

### 6.2 GraphQL

- `TaskType` enum: add `"userDecision"`.
- `UserDecisionType` enum: `yesNo | list | dropdown`.
- `Task`: add `forceUserDecideIfNoMatch`, `userDecisionType`, `userDecisionConfig`, `userDecisionOptions`.
- `QueuedTask`: add `pendingChoice`.
- Task mutations: add `forceUserDecideIfNoMatch`, `userDecisionType`, `userDecisionConfig`.
- New option mutations: `createUserDecisionOption`, `updateUserDecisionOption`, `deleteUserDecisionOption`.
- New answer mutation: `answerUserDecision(queuedTaskId, optionId)`.
- Update `TASKS`, `GET_TASK`, `QUEUED_TASK`, `ACTIVE_QUEUED_TASKS`, `CREATE_QUEUED_TASK`, and `QUEUED_TASK_EVENT` selections.
- Regenerate GraphQL types with `pnpm codegen`; do not hand-edit generated files.

### 6.3 Task validation and cleanup

Extend `assertValidTaskConfig`:

- Validate `userDecisionType` when provided.
- Validate dynamic selectors with `validateWhereExpression`.
- Validate `userDecisionConfig` is a JSON object.
- Do not require options at create/update time, because options and task results are added after the task row is created. Validate at option save time and fail at runtime with a clear note if incomplete.

Extend `deleteTask`:

- Delete the task's `userDecisionOptions`.
- Clear `userDecisionOptions.resultTaskId` references to the deleted task.
- Keep existing cleanup for `fallbackTaskId`, `onTrueTaskId`, `onFalseTaskId`, and `taskResults`.

### 6.4 Security and concurrency

- `answerUserDecision` must be owner-scoped: `queued_by === current user`.
- Verify `status === "awaiting_input"` inside a transaction or conditional update.
- Never accept `nextTaskId`, `resultTaskId`, or option values from the client.
- Only accept an `optionId` that exists in the stored `pendingChoice`.
- Publish after commit; enqueue only once.
- Consider a future TTL/cancel path for abandoned choices; not required for this phase.

---

## 7. Phased implementation

### Phase 1 — `display_block`

- [ ] Extract shared `selectToolState` helper.
- [ ] Add `display_block` tool and register it.
- [ ] Add tool examples and descriptions to the tools page.
- [ ] Extend `Block`/registry for forced block ids and `display_block` output.
- [ ] Add bare-todo matching.
- [ ] Verify with the exact `find_todos` state.

### Phase 2 — schema and config foundations

- [ ] Add `userDecision` and `awaiting_input` enums; add `pendingChoice`.
- [ ] Add `forceUserDecideIfNoMatch`, `userDecisionType`, `userDecisionConfig` to `tasks`.
- [ ] Add `userDecisionOptions` table, relations, indexes, and migration.
- [ ] Extend backend GraphQL, task service validation, and delete cleanup.
- [ ] Extend queries/mutations and run codegen.
- [ ] Extend task form types and task builder with a disabled/placeholder `userDecision` section.

### Phase 3 — pending choice runtime

- [ ] Add `awaitStep` and the `awaiting_input` status handling.
- [ ] Add `processUserDecisionStep`.
- [ ] Add `answerUserDecision` service and mutation.
- [ ] Include `awaiting_input` in `activeQueuedTasks`.
- [ ] Verify a waiting run does not block another queued run.
- [ ] Verify restart persistence and double-answer protection.

### Phase 4 — `userDecision` UI

- [ ] Add static/dynamic option editors to the task builder.
- [ ] Add `UserChoiceBlock` with yes/no, list, and dropdown modes.
- [ ] Add COT rendering for `awaiting_input`.
- [ ] Add flow-graph handles/edges for userDecision options.
- [ ] Verify refresh while waiting shows the choice.

### Phase 5 — force user decide

- [ ] Add the toggle, default on, to decision tasks.
- [ ] Build pending choices from decision results.
- [ ] Hide and ignore fallback while on.
- [ ] Reuse `UserChoiceBlock` for forced decision outputs.
- [ ] Verify result routing and `appendState` after selection.

### Phase 6 — cleanup and regression

- [ ] Confirm `display_block` does not mutate `toolState`.
- [ ] Confirm `filter_tool_state`/`if` legacy entry-level conditions still work.
- [ ] Confirm forced decision tasks with no options fail clearly.
- [ ] Confirm selected dynamic options are appended to `toolState`.
- [ ] Run `pnpm check-types`, `pnpm lint`, and `pnpm build`.
- [ ] Regenerate and verify GraphQL types in both `packages/queries` and `apps/web`.

---

## 8. Verification scenarios

1. **Display all todos** from the exact `find_todos` state.
2. **Display only open todos** with `path: "todos"` and `eq done false`.
3. **Display a single todo** from `find_todo`.
4. **UserDecision list** with two dynamic todos; select “Buy gift”; verify toolState append and next task.
5. **UserDecision yes/no** with editable labels.
6. **UserDecision dropdown** requiring Accept.
7. **Non-blocking queue**: run A waits; run B completes while A is waiting.
8. **COT persistence**: refresh while waiting; the choice block is still visible.
9. **Double answer**: second answer is rejected.
10. **Restart**: waiting row survives; answer still resumes the chain.
11. **Force decision on**: System One recommends one output; user selects another; routing follows the selected result.
12. **Force decision off**: existing match/fallback behavior is unchanged.
13. **No fallback edge** is shown for forced tasks.
14. **No result target** while force is on: clear failure note.
15. **No dynamic matches**: the choice falls back to static options or fails clearly.

---

## 9. Open decisions

1. **Force semantics** — recommended: always ask when on. Alternative: only ask when no result matches. Confirm before implementing.
2. **Existing decision tasks** — schema default `true` makes them forced; alternatively backfill existing rows to `false` and keep `true` for new rows. Decide based on whether existing flows should keep auto-routing.
3. **Dynamic option routing** — recommended: one target per dynamic source, with the selected item appended to `toolState`. Per-item targets cannot be known before runtime.
4. **Option storage** — recommended: separate `userDecisionOptions` table. Reusing `taskResults` would be less work initially but mixes decision thresholds with presentation options.
5. **Abandoned choices** — no timeout in this phase; add a cancel/TTL path later if waiting runs accumulate.
