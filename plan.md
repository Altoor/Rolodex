# Rolodex Cleanup Plan

Status: **planned, decisions confirmed, not implemented**
Branch: `feature/tools`
Scope: Turborepo at the repository root.

This plan keeps existing runtime behaviour unless a change is explicitly marked as a
behaviour fix. Anything that would change behaviour is listed in
[8. Behaviour changes that need sign-off](#8-behaviour-changes-that-need-sign-off).

---

## 1. Goals and rules

1. **Atomic Design for UI**: atoms → molecules → organisms → templates, no skipped
   levels, presentational components (data in via props/form context, events out via
   callbacks), design tokens instead of ad-hoc values.
2. **SOLID for backend/domain code**: one reason to change per module, thin GraphQL
   resolvers, business logic in services, dependencies injected at package boundaries.
3. **Move tools out of the app** into a reusable `packages/tools` workspace package.
4. **Leave the repo compiling at the end of every phase** (`check-types`, `lint`,
   `build`).
5. **No functionality regression**. Pure moves and extractions first; fixes separately.

---

## 2. Current hotspots

| Area | File | Lines | Problem |
| --- | --- | ---: | --- |
| Queue | `apps/backend/src/queue/processor.ts` | 501 | Queue loop, decision step, tool step, state merging, branching, enqueueing and result matching in one file |
| Tasks | `apps/backend/src/schema/task/task-mutations.ts` | 561 | Validation, GraphQL wiring, task CRUD, result CRUD and queue mutations together |
| Tasks | `apps/backend/src/schema/task/task-queries.ts` | 182 | Repeated auth blocks; task and queued-task queries mixed |
| Tools | `apps/backend/src/tools/todo/todos.ts` | 543 | Four tools + todo prompt extraction + DB/embedding helpers |
| Tools | `apps/backend/src/tools/conditions/where.ts` | 320 | Path resolution, comparison, evaluation and validation together |
| Tools | `apps/backend/src/tools/todo/search.ts` | 248 | Search orchestration + raw Drizzle queries + row mapping |
| Tools | `apps/backend/src/tools/todo/deleteOlderThan.ts` | 235 | Duration parsing, date math and DB deletion together |
| Tools | `apps/backend/src/tools/input.ts` | 143 | JSON, tool-output, tool-state and typed input readers together |
| Tools | `apps/backend/src/tools/types.ts` | 137 | All tool model types in one file |
| Tools | `apps/backend/src/schema/tool/tool-mutations.ts` | 172 | GraphQL resolver + test execution + state application together |
| UI | `packages/ui/src/components/task/taskFlow/taskFlow.tsx` | 706 | Layout, edges, cache, mutations, canvas, menu and UI in one component |
| UI | `packages/ui/src/components/task/taskCard/taskCard.tsx` | 421 | Header, models, tool config, branches, results and layout in one component |
| UI | `packages/ui/src/components/task/taskBuilder.tsx` | 326 | Queries, form state, persistence, result actions and render |
| UI | `packages/ui/src/components/tools/toolCard.tsx` | 289 | Form, parsing, mutation, advanced options and result rendering |
| UI | `packages/ui/src/components/task/taskResultOption/taskResultOption.tsx` | 175 | Threshold fields and number parsing |

The main coupling problem: `apps/backend/src/tools/**` imports backend-only modules
(`db`, `ai/model`, `ai/Ollama`, `ai/embeddings`, `schema/builder`). A package cannot
import from an app, so the shared db/ai code must move into workspace packages before
the tools can move.

---

## 3. Target architecture

### 3.1 Supporting packages: `packages/db`, `packages/ai`, and `packages/tools`

Chosen approach: extract shared infrastructure instead of injecting a runtime port.
See [section 9](#9-confirmed-decisions).

Dependency direction (acyclic):

```
@repo/tools  -> @repo/db, @repo/ai
@repo/ai     -> @repo/db
apps/backend -> @repo/tools, @repo/db, @repo/ai
```

#### `packages/db`

```
packages/db/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # re-exports schema, relations, db
    ├── schema.ts             # moved from apps/backend/src/db/schema.ts
    ├── client.ts             # drizzle(process.env.DATABASE_URL!, { relations })
    └── relations/
        ├── index.ts
        └── relations.ts
```

- `apps/backend/src/db/index.ts` becomes a one-line re-export shim for `drizzle-kit`
  and any not-yet-migrated imports. New code imports `@repo/db` directly.
- `apps/backend/drizzle.config.ts` points at `../../packages/db/src/index.ts` (or keeps
  using the shim).
- **Cycle guard**: `schema.ts` currently imports `ToolStateEntry` from the tools types.
  `@repo/db` must not depend on `@repo/tools` because tools already depends on db.
  Replace the column annotation with `unknown[]` (or a local
  `type ToolStateEntry = unknown`) in `packages/db`. The tools package keeps the
  precise type.

#### `packages/ai`

```
packages/ai/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── ollama.ts             # Ollama client singleton
    ├── model.ts              # DEFAULT_MODEL, getModelForUser,
    │                         # getDecisionModelForUser, assertPulledModel
    └── embeddings.ts         # EMBEDDING_*, embedText, tryEmbedText, todoEmbeddingText
```

- Depends on `@repo/db` and `ollama`.
- `apps/backend/src/ai/**` is deleted; backend imports `@repo/ai`.
- GraphQL-specific decision question setup (`schema/ai/ai-service.ts`) stays in the app.

#### `packages/tools`

```
packages/tools/
├── package.json
├── tsconfig.json
├── eslint.config.js
└── src/
    ├── index.ts
    ├── model/
    │   ├── index.ts
    │   ├── tool.ts              # Tool, ToolDefinition, ToolConfig
    │   ├── tool-schema.ts       # ToolInputProperty, ToolInputSchema
    │   ├── tool-state.ts        # ToolStateEntry, ToolStateEntryInput
    │   ├── tool-context.ts      # ToolRunContext
    │   ├── tool-execution.ts    # ToolExecution
    │   └── tool-error.ts        # ToolInputError
    ├── utils/
    │   ├── index.ts
    │   ├── json.ts              # parseJsonObject, isPlainObject
    │   ├── tool-input.ts        # readString/readNumber/readBoolean/
    │   │                        # readNumberArray/requireNonEmptyString/mergeToolInput
    │   ├── tool-output.ts       # TOOL_OUTPUT_* + serialize/extract
    │   ├── tool-state.ts        # serializeToolState, toToolStateEntries,
    │   │                        # applyExecutionToToolState
    │   ├── numbers.ts           # asFiniteNumber
    │   ├── dates.ts             # nowForPrompt, parseIsoDateTime
    │   ├── paths.ts             # readPath
    │   └── values.ts            # valuesEqual, compareValues, asDate
    ├── conditions/
    │   ├── index.ts
    │   ├── where.ts             # public re-exports
    │   ├── where-types.ts
    │   ├── where-evaluate.ts
    │   └── where-validate.ts
    ├── tools/
    │   ├── prompt/prompt.ts
    │   ├── modelSelector/modelSelector.ts
    │   ├── if/ifTool.ts
    │   ├── toolState/appendState.ts
    │   ├── toolState/setState.ts
    │   ├── toolState/filterToolState.ts
    │   └── todo/
    │       ├── date.ts
    │       ├── search.ts
    │       ├── selection.ts
    │       ├── todos.ts
    │       ├── findTodo.ts
    │       ├── findTodos.ts
    │       ├── archiveTodo.ts
    │       └── deleteOlderThan.ts
    └── registry/
        ├── index.ts
        ├── definitions.ts       # static ToolDefinition list
        └── registry.ts          # getTool/getToolDefinition/listTools/requireTool
```

- Tools import `db` and `todos` from `@repo/db`, and `ollama` / model / embedding helpers
  from `@repo/ai`. This is the accepted trade-off of this approach: these are shared
  infrastructure packages, not app code.
- Tool files keep the same query and execution semantics. The move is mechanical.
- `packages/tools` may depend on `drizzle-orm`, `ollama` (types), `@repo/db`, `@repo/ai`.
- Add `check-types` (`tsc --noEmit`) and `lint` scripts.
- Expose TypeScript source via package exports (`".": "./src/index.ts"`) so the backend's
  `tsx` runtime can consume it without a build step. If module resolution fails, switch
  to compiled `dist` output like `@repo/ui`.

The backend stays the composition root for GraphQL and the queue:

```ts
// apps/backend/src/tools/registry.ts
export {
  getTool,
  getToolDefinition,
  listToolDefinitions,
  requireTool,
} from "@repo/tools";
```

---

### 3.2 Backend queue layout

```
apps/backend/src/queue/
├── index.ts                     # public exports only
├── processor.ts                 # queue loop + step dispatch (~80 lines)
├── constants.ts                 # MAX_CHAIN_DEPTH, MAX_FOREACH_ITEMS
├── step-store.ts                # claim/finish/enqueue/publish DB access
├── result-matcher.ts            # resultMatches, summarizeAnswer
└── processors/
    ├── decision-step.ts         # decision task execution
    ├── tool-step.ts             # tool step orchestration
    └── tool-step/
        ├── validate-tool.ts     # toolKey/outputType/config validation
        ├── apply-tool-state.ts  # execution -> next state/toolState
        ├── resolve-tool-branch.ts # execution -> nextTaskId/branch/note
        ├── enqueue-normal.ts    # normal output -> one next step
        ├── enqueue-foreach.ts   # foreach -> child steps + limits
        └── build-tool-result.ts # result payload for queuedTasks.result
```

### 3.3 Backend task layout

```
apps/backend/src/schema/task/
├── index.ts
├── task.ts                     # Task GraphQL object + enums
├── task-result.ts              # TaskResult GraphQL object
├── queued-task.ts              # QueuedTask + QueuedTaskEvent GraphQL objects
├── task-service.ts             # assertValidTaskConfig + task CRUD/business rules
├── task-result-service.ts      # TaskResult CRUD/business rules
├── queued-task-service.ts      # queued-task lifecycle/business rules
├── task-mutations.ts           # thin resolvers -> task-service
├── task-result-mutations.ts    # thin resolvers -> task-result-service
├── queued-task-mutations.ts    # thin resolvers -> queued-task-service
├── task-queries.ts             # Task/TaskResult queries
├── queued-task-queries.ts      # queued task queries
├── task-subscriptions.ts
└── task-auth.ts                # optional shared requireUser helper usage
```

### 3.4 Backend tool schema layout

```
apps/backend/src/schema/tool/
├── index.ts
├── tool.ts                     # Tool GraphQL object
├── tool-test-result.ts         # ToolTestResult GraphQL object
├── tool-service.ts             # testTool execution + state application
├── tool-queries.ts             # thin query resolvers
└── tool-mutations.ts           # thin mutation resolver
```

---

## 4. Requested refactors

### 4.1 Create `packages/db`, `packages/ai`, and `packages/tools`; move all tools

Steps:

1. Scaffold `packages/db`; move `apps/backend/src/db/**` and the drizzle client
   construction out of `schema/builder.ts` into `db/client.ts`. Leave
   `apps/backend/src/db/index.ts` as a re-export shim.
2. Scaffold `packages/ai`; move `apps/backend/src/ai/{Ollama,model,embeddings}.ts`.
3. Scaffold `packages/tools`; add workspace dependencies from `apps/backend`.
4. Move model types first (4.8), then `input.ts` concerns (4.7), then `conditions/`
   (4.6), then every file under `apps/backend/src/tools/**`.
5. Update tool imports to `@repo/db` / `@repo/ai`. No moved tool file may keep a
   relative path into `apps/backend`.
6. Update backend imports:
   - `schema/tool/*`, `schema/task/*`, `queue/*`, `scripts/*`
   - `schema/builder.ts` imports `db`/`relations` from `@repo/db`
   - `db/schema.ts` shim and drizzle config
7. Delete `apps/backend/src/ai/**` and the old tool implementation files. Keep only
   `apps/backend/src/tools/registry.ts` as a re-export point.
8. Add the packages to `apps/backend` dependencies and run `pnpm install`.

#### 4.1.1 Tool file mapping

| Old path | New path |
| --- | --- |
| `apps/backend/src/tools/index.ts` | `packages/tools/src/index.ts` |
| `apps/backend/src/tools/types.ts` | `packages/tools/src/model/*` |
| `apps/backend/src/tools/input.ts` | `packages/tools/src/utils/*` |
| `apps/backend/src/tools/conditions/where.ts` | `packages/tools/src/conditions/*` |
| `apps/backend/src/tools/registry.ts` | `packages/tools/src/registry/*` |
| `apps/backend/src/tools/prompt/prompt.ts` | `packages/tools/src/tools/prompt/prompt.ts` |
| `apps/backend/src/tools/modelSelector/modelSelector.ts` | `packages/tools/src/tools/modelSelector/modelSelector.ts` |
| `apps/backend/src/tools/if/ifTool.ts` | `packages/tools/src/tools/if/ifTool.ts` |
| `apps/backend/src/tools/toolState/*.ts` | `packages/tools/src/tools/toolState/*.ts` |
| `apps/backend/src/tools/todo/*.ts` | `packages/tools/src/tools/todo/*.ts` |
| `apps/backend/src/db/**` | `packages/db/src/**` |
| `apps/backend/src/ai/Ollama.ts` | `packages/ai/src/ollama.ts` |
| `apps/backend/src/ai/model.ts` | `packages/ai/src/model.ts` |
| `apps/backend/src/ai/embeddings.ts` | `packages/ai/src/embeddings.ts` |

The backend keeps `schema/tool/*` and `schema/task/*` because they are GraphQL
resolvers, not tool implementations.

### 4.2 Break up `processToolStep` and make `processor.ts` SOLID

`processor.ts` keeps only orchestration:

- `triggerQueue`, `resetStaleRunningTasks`, `processQueue` (the loop).
- `processStep` dispatches on `task.type` to a handler:
  - `decision` → `processors/decision-step.ts`
  - `tool` → `processors/tool-step.ts`
  - anything else → completed-with-skip note (current behaviour).
- A small `StepHandler` map makes adding a new task type a new handler, not another
  branch in the processor (open/closed).
- `step-store.ts` owns `claim`, `finishStep`, `enqueueStep`, `enqueueChildren`,
  `publish` so the processors do not talk to Drizzle directly.

`processors/tool-step.ts` becomes the orchestrator and delegates:

| New module | Responsibility |
| --- | --- |
| `validate-tool.ts` | Missing `toolKey`, unknown tool, unsupported output type |
| model resolution | Keep in `tool-step.ts` (row/task/user fallback, unchanged order) |
| `apply-tool-state.ts` | `nextState`, `toolState`, `toolStateAppend`, `clearToolState`, `appendOutput` |
| `resolve-tool-branch.ts` | branch → `onTrueTaskId`/`onFalseTaskId`, explicit `nextTaskId`, `fallbackTaskId`, depth limit, note |
| `enqueue-normal.ts` | Insert one next queued task |
| `enqueue-foreach.ts` | Item count limit, fork task, batch insert, child ids |
| `build-tool-result.ts` | Build `queuedTasks.result` payload |

Each helper is pure or takes `step-store` explicitly, and each is small enough to
unit test. The execution order and side effects stay identical to the
current `processToolStep`.

`result-matcher.ts` receives `resultMatches` and `summarizeAnswer` from the bottom of
`processor.ts`.

### 4.3 Move `assertValidTaskConfig` to `task-service.ts`

- Move the function verbatim into `apps/backend/src/schema/task/task-service.ts`.
- Keep the exact error messages and `BAD_USER_INPUT` extensions.
- `createTask` and `updateTask` service functions call it; the resolvers no longer
  know about validation.
- Also move task DTO building and patch merging (`nextType`, `nextToolKey`, …) into
  the service, since that is business logic.

### 4.4 Split Tasks into smaller pieces

- `task-service.ts`: `assertValidTaskConfig`, `createTask`, `updateTask`,
  `deleteTask` (+ link cleanup), `createQueuedTask`, `completeQueuedTask`,
  `deleteQueuedTask`, `deleteCompletedQueuedTasksBefore`.
- `task-result-service.ts`: `createTaskResult`, `updateTaskResult`,
  `deleteTaskResult`.
- `queued-task-service.ts`: queue lifecycle, default-task resolution, run id creation,
  `triggerQueue` call.
- `task-mutations.ts`, `task-result-mutations.ts`, `queued-task-mutations.ts`: only
  argument parsing, auth, service call, return.
- `task-queries.ts` / `queued-task-queries.ts`: split by subject.
- `task.ts` is split into `task.ts`, `task-result.ts`, `queued-task.ts` (GraphQL
  object types and enums).
- `task-subscriptions.ts` stays, but uses the shared auth helper.

Services throw the same `GraphQLError`s as today where practical; the resolver
boundary remains thin. If domain errors are introduced, map them to the same GraphQL
extensions so clients see no change.

### 4.5 Move functions from `tool-mutations.ts` into `tool-service.ts`

Move:

- `toTestEntries`
- `applyExecution`
- `parseToolState`
- the `testTool` execution orchestration (config/model resolution, tool lookup,
  output-type validation, error mapping)

`tool-mutations.ts` keeps only the Pothos field definition and calls
`runToolTest(...)`. Reuse `applyExecutionToToolState` from
`@repo/tools/utils/tool-state` so the processor and the tool tester share one
implementation instead of two near-duplicates.

### 4.6 Move `conditions/` into `packages/tools`

- Move `where.ts` to `packages/tools/src/conditions/`.
- Split it by concern:
  - `where-types.ts` (`WhereOperator`, `WhereComparison`, `WhereExpression`,
    `WhereEvaluation`, options)
  - `where-path.ts` (`readPath`)
  - `where-evaluate.ts` (`evaluateExpression`, `evaluateWhere`)
  - `where-validate.ts` (`validateWhereExpression`, depth/key checks)
  - `where.ts` re-exports the public API.
- Update `ifTool.ts` and `filterToolState.ts` imports.
- Keep error messages and validation semantics identical.

### 4.7 Split `tools/input.ts` and put general helpers in `utils/`

| Current export | New home |
| --- | --- |
| `TOOL_OUTPUT_START`, `TOOL_OUTPUT_END` | `utils/tool-output.ts` |
| `parseJsonObject`, `isPlainObject` | `utils/json.ts` |
| `serializeToolOutput`, `extractToolOutput` | `utils/tool-output.ts` |
| `serializeToolState` | `utils/tool-state.ts` |
| `mergeToolInput` | `utils/tool-input.ts` |
| `readString`, `readNumber`, `readBoolean`, `requireNonEmptyString` | `utils/tool-input.ts` |
| new `readNumberArray` | `utils/tool-input.ts` (moved from `filterToolState`) |
| `toToolStateEntries` (duplicated) | `utils/tool-state.ts` |
| `applyExecutionToToolState` (new, shared) | `utils/tool-state.ts` |
| `parseNullableNumber` (UI) | `packages/ui/src/lib/numbers.ts` |

`utils/index.ts` is a barrel, but internal imports use the specific file to keep
dependency graphs obvious.

### 4.8 Split `tools/types.ts` into `tools/model/`

Mapping:

| Current | New |
| --- | --- |
| `ToolConfig`, `ToolInputMode`, `ToolOutputType`, `Tool`, `ToolDefinition` | `model/tool.ts` |
| `ToolInputProperty`, `ToolInputSchema` | `model/tool-schema.ts` |
| `ToolStateEntry`, `ToolStateEntryInput` | `model/tool-state.ts` |
| `ToolRunContext` | `model/tool-context.ts` |
| `ToolExecution` | `model/tool-execution.ts` |
| `ToolInputError` | `model/tool-error.ts` |

`ToolExecution` also loses the deprecated `stateAppend` and `appendState` fields (see
[8.1](#81-deprecated-toolexecution-fields-removed)). The replacement field is
`appendOutput?: boolean`.

`model/index.ts` re-exports the public types so existing imports can move in one step.

### 4.9 Break up `TaskCard`

Target tree (atomic design):

```
taskCard/
├── taskCard.tsx                 # organism: composes the sections below
├── taskCard.types.ts            # TaskCardProps, TaskOption
└── components/
    ├── taskCardHeader.tsx       # molecule: type select + name + save
    ├── taskModelFields.tsx      # molecule: generation + decision model selects
    ├── modelSelectField.tsx     # atom/molecule: reusable model dropdown
    ├── toolTaskFields.tsx       # organism: tool-specific fields
    │   ├── toolSelectField.tsx
    │   ├── toolConfigField.tsx
    │   ├── toolOutputTypeField.tsx
    │   └── branchTaskFields.tsx # uses branchTaskSelect twice
    ├── branchTaskSelect.tsx     # molecule: task select with "Stop run"
    ├── taskResultsSection.tsx   # organism: result list + add button
    └── saveTaskButton.tsx       # atom
```

Notes:

- `TASK_TYPES` and `TaskOption` move to `task-form.ts`/`taskCard.types.ts`.
- `ToolDetails` remains an external molecule/organism and is composed, not copied.
- All subcomponents stay presentational: form values through `useFormContext`,
  actions through callbacks.
- The duplicated true/false branch select becomes one `branchTaskSelect` molecule.
- Shared sizing in the new components comes from existing tokens/utility scales;
  no new arbitrary values.

### 4.10 Break up `TaskFlow`

Target tree:

```
taskFlow/
├── taskFlow.tsx                 # container: query + mutations + composition
├── taskFlowTypes.ts             # unchanged public types, plus action types
├── taskFlowNode.tsx             # node organism
├── components/
│   ├── taskFlowToolbar.tsx      # first-task select + New Task
│   ├── taskFlowCanvas.tsx       # ReactFlow canvas only
│   ├── taskFlowContextMenu.tsx  # edge/pane context menu
│   ├── taskFlowNodeHeader.tsx   # title/type/model labels
│   ├── taskFlowNodeHandles.tsx  # result/fallback/if handles
│   └── taskFlowHelpText.tsx
├── hooks/
│   ├── useTaskFlowGraph.ts      # tasks -> nodes/edges
│   ├── useTaskFlowActions.ts    # create/update/delete/insert/connect
│   └── useTaskFlowContextMenu.ts
└── services/
    ├── layout.ts                # computePositions
    ├── nodes.ts                 # buildNodes
    ├── edges.ts                 # buildEdges + edge id helpers
    ├── cache.ts                 # setTaskFieldInCache/setResultTaskIdInCache
    ├── connection.ts            # isValidConnection + source-handle -> field mapping
    └── edge-operations.ts       # insertTaskOnEdge/rewire/rollback
```

Notes:

- `taskFlow.tsx` keeps only state ownership and wiring; it renders toolbar, canvas
  and menu.
- The edge/source-handle mapping is one function used by connect, delete and insert,
  removing three copies of the same branch logic.
- Cache mutations remain optimistic exactly as today.
- `TaskFlowNode` is split into header and handle rows so the node component is
  presentational and small.
- Replace the raw edge colour `#d4d4d8` with a design token/CSS variable or a named
  constant if the token would be one-off. This is a visual-neutral refactor.

### 4.11 Break up `taskBuilder`

Target tree:

```
taskBuilder/
├── taskBuilder.tsx              # container composition only
├── task-builder-service.ts      # pure functions
├── hooks/
│   ├── useTaskBuilderData.ts    # TOOLS/MODELS/TASKS queries + mapping
│   ├── useTaskBuilderForm.ts    # useForm + field array
│   ├── useTaskPersistence.ts    # create/update task mutations + save
│   └── useTaskResultActions.ts  # add/save/delete result actions
└── components/
    └── taskDecisionSection.tsx  # decision builder/list selection
```

Pure service functions to extract:

- `parseBranchTaskId`
- `parseToolConfigText`
- `buildTaskVariables(values, selectedDecisionId)`
- `taskRecordToFormValues` (thin wrapper around existing `taskToFormValues`)
- `buildTaskResultVariables(result, taskId)`
- `toBranchTaskOptions(tasks)` / `toModelNames(models)`

The two loading effects move into hooks. The render tree becomes
`<TaskCard … />` plus `<TaskDecisionSection … />`.

### 4.12 Break up `toolCard`

Target tree:

```
tools/toolCard/
├── toolCard.tsx                 # container: mutation + form + composition
├── tool-test-service.ts         # pure parsing/variable building
├── hooks/
│   └── useToolTest.ts           # mutation state + error mapping
└── components/
    ├── toolCardHeader.tsx       # title + key/category badges + description
    ├── toolTestForm.tsx         # form shell + run button
    ├── toolStateField.tsx       # state textarea
    ├── toolAdvancedOptions.tsx  # accordion fields
    ├── toolDetailsAccordion.tsx # ToolDetails wrapper
    └── toolTestResult.tsx       # result accordion + Block + state output
```

Pure service functions:

- `parseToolConfig(value)`
- `parseToolState(value)`
- `buildTestToolVariables(tool, inputs)`

`ToolCard` becomes a small container; all child components receive props and callbacks.

---

## 5. Additional cleanups worth doing in the same pass

These are non-functional or low-risk and fit the cleanup goals.

1. **Shared auth helper**: add `requireUser(ctx)` to `schema/auth.ts` returning the
   user, and replace repeated `const user = (ctx as any).user; if (!user) throw …`
   blocks in task queries/subscriptions. Keep `requireUserId` as a wrapper.
2. **Remove unused variables**: many resolvers assign `const author_id = requireUserId(ctx)`
   but never use it. Keep the auth call, drop the binding:
   `requireUserId(ctx);`.
3. **Deduplicate tool-state application**: processor and `tool-mutations` currently
   both implement it. One shared `applyExecutionToToolState` in `packages/tools/utils`.
4. **Deduplicate `toToolStateEntries`**: exists in `processor.ts` and
   `tool-mutations.ts`.
5. **Extract `parseNullableNumber`** to `packages/ui/src/lib/numbers.ts`; reuse in
   `TaskResultOption`.
6. **Tool details types**: `toolDetails.tsx` redefines input-schema types. Use the
   generated `GetToolsQuery` tool shape (or one small shared view type) instead.
7. **Repeated task query auth**: task queries use `(ctx as any).user`; use the shared
   helper.
8. **Barrel discipline**: package root exports public API only; internal modules
   import siblings directly to avoid cycles.
9. **`db/schema.ts`**: use `unknown[]` for `queuedTasks.toolState` in `@repo/db`; do
   not import from `@repo/tools` (that would create a package cycle).
10. **Docs**: short READMEs in `packages/db`, `packages/ai`, and `packages/tools`
    describing the package boundaries and how to add a tool.
11. **Optional tests**: add Vitest to `packages/tools` for pure helpers
    (`where`, `readPath`, `applyExecutionToToolState`, `parseToolConfig`) and to
    `packages/ui` for `layout`, `edges`, `task-builder-service`. This is not required
    to finish the refactor but is the cheapest regression net.
12. **Design-token normalisation**: inventory arbitrary values in every touched UI file
    and replace them with existing scale utilities or new shared tokens. Details in
    5.1.

### 5.1 Design-token normalisation

Confirmed: normalise all one-off values, not only exact matches.

- Add shared tokens to `packages/tailwind-config` (or the existing `@theme` block) for
  repeated dimensions and colours, e.g.:
  - `--size-select-sm: 11.25rem` (the repeated `w-[180px]`)
  - `--size-flow-root-select: 13.75rem` (`w-[220px]`)
  - `--color-edge-muted: #d4d4d8` (or map to an existing border/muted token)
- Flow node geometry (`COLUMN_WIDTH` / `ROW_HEIGHT`) stays as named constants in
  `taskFlow/services/layout.ts`; it feeds numeric React Flow positions, not CSS.
- Use `@theme`/CSS variables, not one-off utility classes.
- Prefer an existing scale value when it is visually equivalent; only create a token
  when the value is shared or semantically meaningful.
- Replace bracket/hex values in the touched components (`taskCard`, `taskFlow`,
  `taskBuilder`, `toolCard`, `taskResultOption`). Do not churn untouched components in
  this pass.
- Verify contrast and spacing manually; small visual shifts are acceptable.

---

## 6. Suggested execution order (PR-sized phases)

Each phase must leave `pnpm check-types` and `pnpm lint` green.

1. **Phase 1 — Foundation packages**
   - Scaffold `packages/db`, `packages/ai`, and `packages/tools`.
   - Move `db` and `ai` infrastructure; update backend imports and keep the db shim.
   - Move/split tool model types and utils.
   - Move conditions.
   - No tool implementations moved yet.
2. **Phase 2 — Move tool implementations**
   - Move every tool into `packages/tools`.
   - Update imports to `@repo/db` / `@repo/ai`.
   - Keep `apps/backend/src/tools/registry.ts` as the re-export point.
   - Delete old backend tool files.
3. **Phase 3 — Queue processor split**
   - Extract `step-store`, `result-matcher`, decision processor and tool-step helpers.
   - Keep behaviour identical.
4. **Phase 4 — Backend tasks + tool service**
   - Split task schema files, add services, move `assertValidTaskConfig`.
   - Move tool-mutation helpers into `tool-service.ts`.
5. **Phase 5 — UI TaskCard**
   - Split into header/model/tool/results components.
6. **Phase 6 — UI TaskFlow**
   - Split services/hooks/components; remove duplicated edge logic.
7. **Phase 7 — UI taskBuilder**
   - Extract pure service + hooks + decision section.
8. **Phase 8 — UI toolCard**
   - Extract service + hook + components.
9. **Phase 9 — Polish**
   - Shared auth helper, unused vars, dedupe helpers, token pass, docs, optional tests.

Phases 5–8 are independent of each other and can be done in parallel after Phase 1.

---

## 7. Verification

Automated:

```bash
pnpm install
pnpm check-types
pnpm lint
pnpm build
```

Manual smoke tests:

1. **Tools page**: open every tool, run a read-only tool (e.g. `find_todo`,
   `append_state`) and a mutating tool with a dry run where supported.
2. **Task queue**: create a task, edit it, wire result/fallback/if edges, delete an
   edge, insert a task on an edge, add a task at a position, delete a task.
3. **Queue execution**: start a decision chain, verify result branches, fallback and
   `if` true/false branches.
4. **Tool chains**: verify normal output, foreach fan-out, model selector, tool state
   append/set/filter.
5. **Todo tools**: create/update/find/find-many/archive/delete-older-than, including
   vector and lexical paths.
6. **GraphQL regression**: run the app's `codegen` and confirm no schema changes.

Atomic Design checklist for every extracted UI piece:

- [ ] Every visual element traces to an atom (no raw markup in organisms).
- [ ] Components use tokens/existing utility scales, not new one-off values.
- [ ] Each component has one responsibility appropriate to its level.
- [ ] Components are presentational (props/form context in, callbacks out).
- [ ] Hierarchy is self-evident from the directory tree.

---

## 8. Approved behaviour changes

The following changes were confirmed for this cleanup.

1. **`getTask` missing `await`** — fixed: await the query and throw the existing
   `BAD_USER_INPUT "Task not found"` error when the task is absent.
2. **`TaskResult.resultTask` relation** — fixed: point the field at the `resultTask`
   relation (the `resultTaskId` target) instead of the parent `task`.
3. **Deprecated tool fields** — removed now (see 8.1).
4. **Design tokens** — normalise all one-off Tailwind values in touched components,
   including creating shared tokens for repeated values. Small visual shifts are
   acceptable.
5. **Service errors** — still deferred. Keep `GraphQLError` in services to preserve the
   client contract; a later pass can introduce domain errors + a resolver mapper.

### 8.1 Deprecated `ToolExecution` fields removed

- Remove `stateAppend?: string`. No tool sets it today, and it is only converted by the
  processor/tool service. Any future need is covered by
  `toolStateAppend: { text: value }`.
- Remove `appendState?: boolean` and replace it with `appendOutput?: boolean` with the
  same meaning: append `execution.output` to the next toolState. This removes the
  confusing overlap with `TaskResult.appendState` and `toolConfig.appendState`.
- Update tool return values:
  - `prompt`, `findTodo`, `findTodos`: drop `appendState: true` (it is already a no-op
    when `toolStateAppend` is present).
  - `if`, `setState`, `filterToolState`, `appendState`: change `appendState: false` to
    `appendOutput: false`.
- Processor and tool service use
  `execution.appendOutput ?? Boolean(toolConfig?.appendState)`, preserving the existing
  `toolConfig` override.
- Add tests/manual checks for: normal tool output append, explicit `toolStateAppend`,
  `clearToolState`, and the `toolConfig.appendState` fallback.

---

## 9. Confirmed decisions

1. **Tools boundary** — extract `@repo/db` and `@repo/ai`, then move tools into
   `@repo/tools` and import those packages. This is the chosen approach throughout this
   plan.
2. **Bug fixes** — include both `getTask` and `resultTask` fixes in this cleanup.
3. **Deprecated tool fields** — remove `stateAppend` and `appendState` now; use
   `toolStateAppend` and the new non-deprecated `appendOutput`.
4. **Design tokens** — normalise all one-off values in touched components, even if
   spacing/colours shift slightly.

Implementation can start with Phase 1 in [section 6](#6-suggested-execution-order-pr-sized-phases).

---

## 10. Implementation status

All phases are implemented on `feature/tools`:

- **Packages** — `@repo/db`, `@repo/ai` and `@repo/tools` exist; backend imports
  them through the compatibility shims in `apps/backend/src/{db,ai,tools}`.
- **Tools** — every tool and `conditions/` now lives in `packages/tools`; model
  types are split under `src/model/`, and general helpers under `src/utils/`.
- **Queue** — `processor.ts` now dispatches to `processors/decision-step.ts` and
  `processors/tool-step.ts`, with `step-store.ts`, `result-matcher.ts` and the
  `tool-step/*` helpers.
- **Backend tasks/tools** — task services, thin resolvers and `tool-service.ts`
  are in place; deprecated execution fields were removed.
- **UI** — `TaskCard`, `TaskFlow`, `taskBuilder` and `toolCard` are split into
  containers, hooks/services and presentational components. Design tokens were
  added for the repeated select widths and the muted graph edge colour.
- **Polish** — shared auth helper, deduplicated tool-state application, shared
  `parseNullableNumber`, package READMEs, and token normalisation in touched UI
  files.

Verified:

```bash
pnpm install
pnpm check-types
pnpm lint
pnpm build
```

`apps/backend` was also checked with `tsc --noEmit` because it has no
`check-types` script. Manual smoke tests from section 7 still need to be run
against a live backend/Ollama instance.
