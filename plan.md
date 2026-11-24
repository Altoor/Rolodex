# Assisted Runs Refactor Plan

Status: **implemented on `feature/self-improvement` working tree — see
§16 Implementation status**

Scope: revise the whole `feature/self-improvement` branch compared with `main`.
Primary reference branch: `feature/self-improvement` at `8bf9f24`.
Baseline comparison: `376d9ce` (merge-base with `main`).

---

## 1. Executive summary

The branch currently adds three large behaviours that do not compose well:

1. **Learned decision bias** — corrections nudge future System One answers.
2. **End-to-end flow creation** — a planner/draft/confirm pipeline that builds
   and starts flows for the user.
3. **Runtime step gating** — auto-improvement runs pause between steps, but the
   pause is a task-approval prompt, not an outcome review.

The target is a single, legible assisted-run experience:

- The user explicitly selects a starting task and writes the state/prompt.
- The starting task runs.
- Each tool or decision step pauses for an outcome review.
- Tool steps run inside a sandboxed checkpoint so files/todos are not committed
  until the step is accepted.
- Rejecting a step lets the model propose one of four concrete repairs:
  new tool config, replace the tool/task, insert tool(s) before/after, or run
  the next task in line.
- The repaired step is re-run from the original checkpoint and reviewed again.
- Accepting commits the effect to the real files/todos and persists the revised
  task/decision definition.
- Cancelling drops the run and leaves the task definitions untouched.
- Every action, prompt, model response, state delta, and sandbox effect is
  visible in a closed-by-default trace accordion and streamed live.
- Decision steps ask “is this the right choice?”. The user can override,
  optimize the wording, or add a new option. Optimization is capped at three
  model attempts and must not rely on confidence below 0.8.

The implementation is split into testable phases. Bias and the whole flow
planner are removed first so the new design is built on a small base.

---

## 2. Decisions already locked

| Topic | Decision |
|---|---|
| Rejected tool side effects | **Sandbox + commit on accept.** Trials write to an isolated workspace/journal; real files/todos only change on acceptance. |
| Which runs are reviewed | **Only assisted runs** started from the landing/task-queue assistant. Standard queue runs behave as before. |
| Commit timing | **Per-step accept.** Accepting a step persists that step’s task/decision edits and effects immediately. |
| Flow-creation module | **Remove planner and auto-start; keep reusable primitives** (structured generation, task config validation, target selection, decision wiring rebuilt inside the new decision review). |
| Trace contents | **Actions + prompts + model output, streamed live.** Persisted until the queued task/run is deleted. |
| User-decision review | **No model review; only option/wording editing.** |
| Confidence threshold | **0.8 on the 0..1 probability/confidence scale**, normalized for score/noul. |
| Test stack | **Add Vitest + a disposable Postgres test harness**; UI component tests with React Testing Library. |
| Task-queue assistant | **Operates on the current task draft**, including unsaved edits. Accepted revisions update that task. |
| Assisted ordering | **Force sequential**, one step at a time, including foreach children. |
| Manual decision override | **This run only** unless the user accepts wording optimization. |
| Task version history | **No restorable version history.** Pre-change snapshots live only in the attempt/trace until run deletion. |
| Trace retention | **Until the owning queued task/run is deleted** via the existing history-delete style mutation. |

---

## 3. Current branch audit

### 3.1 Bias mechanic

Current implementation:

- `apps/backend/src/queue/decision-bias.ts` — clamps and applies per-option,
  `__score__`, and `__noul__` bias to a System One answer before matching.
- `packages/db/src/schema.ts` — `decisionBiases` and `decisionFeedback` tables.
- `apps/backend/src/schema/flow/decision-review-service.ts` — review writes
  additive deltas and reverses previous corrections.
- `apps/backend/src/queue/processors/decision-step.ts` — loads biases before
  matching and stores `appliedBiases` in the result.
- UI: `packages/ui/src/components/flow/decision-review/*` shows bias badges.
- `apps/backend/src/scripts/flowBiasSmoke.ts` tests the mechanic.

Problems:

- Learned bias is invisible and global; it changes future answers for every
  user because tasks/decisions are workspace-global.
- It optimizes matching without changing the actual decision wording.
- It is unreviewable across runs and conflicts with the new explicit review
  model.
- It has no place in the target UX.

**Decision: remove all of it** — code, tables, GraphQL object, UI, script, docs,
generated types, and tests.

### 3.2 End-to-end flow creation

Current implementation:

- `flow-proposal-service.ts` — picks a starting candidate with System One.
- `flow-draft-service.ts` (652 lines) — generates task/decision/user-decision
  drafts.
- `flow-start-service.ts` — persists drafts and optionally starts a run.
- `flow-plan-service.ts` (2,749 lines, untracked) — attempts whole-flow planning.
- `flow-run-review-service.ts` (untracked) — reviews a planned run and re-plans.
- `flow-mutations.ts` exposes propose/refine/draft/confirm/plan/review.
- UI: `flow-start-assistant.tsx`, `flow-draft-editor.tsx` (801 lines),
  `use-flow-start-assistant.ts` (353 lines), `run-review-panel.tsx`,
  `use-landing-plan.ts`, `next-step-gate.tsx`, `next-task-wiring.tsx` (451
  lines).

Problems:

- The learning surface is enormous and opaque: the user sees a proposal, then a
  draft, then a whole run, with no clear moment-to-moment feedback.
- The planner creates and mutates tasks before the user has validated a single
  step.
- Run-level review is too late; the user cannot correct a tool or decision at
  the point of failure.
- The code violates SRP badly (one planning service nearly 2,800 lines).

**Decision: delete the planner, proposer, draft/confirm pipeline, auto-planned
runs, and run-level review.** Keep only primitives worth reusing:
structured JSON generation, task config validation, task target selection, and
decision-result wiring. Rebuild those inside the assisted-run domain.

### 3.3 Runtime gating

`gate-next-step.ts` pauses every step after the first when the setting is on,
then asks the user to approve the proposed task. It does not review the outcome
of the previous step. `confirm-next-step.ts` allows a run-only task swap.

Problems:

- The prompt is about the *next* task, not the *result* of the last task.
- No checkpoint is kept, no side effects are staged, and no revision is
  possible.
- `nextStepApproved`, `autoPlanned`, `flowGoal`, and `runReview` are
  denormalized on every queue row.

**Decision: remove the gate and the extra queue columns; replace with
attempt-based review after execution.**

### 3.4 Task assistants

- Landing: the assistant is the flow-start pipeline, hidden behind mutations.
- Task queue: `taskBuilderAssistant.tsx` reuses the same flow-start machinery in
  “build mode”, creating a task instead of testing it.

Problems:

- Neither assistant runs a task and shows what happened.
- Both share an opaque proposal/draft state machine.
- There is no trace, no live feedback, and no path from observed behaviour to a
  task revision.

**Decision: one shared assisted-run workflow, two entry points**
(landing composer and task-builder panel).

### 3.5 Queue and state model

Current model:

- `queuedTasks` carries `state` (immutable run text), accumulated `toolState`,
  status, result, pending choice, depth, run id.
- Tool execution mutates real files/todos immediately.
- `finishStep` marks the row complete and the processor enqueues the next step
  immediately.
- There is no pre-step checkpoint table and no attempt history.
- Parallel and prioritized runs can interleave freely.

Problems:

- By the time the user reviews an outcome, effects are already committed.
- Re-running a revised tool from the original state is not possible without
  manual reconstruction.
- There is no clean place to store the task snapshot used for a trial or the
  effects it produced.

**Decision: introduce runs, attempts, checkpoints, effect journals, and trace
events. Assisted runs execute sequentially through attempts.**

### 3.6 Decisions

- System One answers are matched against `taskResults` thresholds.
- Bias is applied before matching.
- Low-confidence answers can still match if the result threshold is lower than
  0.8.
- The only post-run correction is bias.

**Decision: remove bias; add explicit decision review, run-only overrides,
wording optimization (max 3 attempts), and new-option creation. Enforce a 0.8
floor for assisted decisions.**

### 3.7 UI structure

- Landing run step is 235 lines and mixes rendering, review, wiring, revision,
  and prompts.
- Flow UI is spread across `components/flow` and `components/landing` with
  overlapping responsibilities.
- Components fetch and mutate directly; presentational boundaries are weak.
- Existing atoms (`Button`, `Badge`, `Field`, `Trace`, `ChainOfThought`,
  `Collapsible`) are a good base.

**Decision: rebuild the assisted UI with atomic design under
`packages/ui/src/components/assisted`, presentational components, and container
hooks.**

### 3.8 Oversized / high-risk files

| File | Lines | Plan |
|---|---:|---|
| `apps/backend/src/schema/flow/flow-plan-service.ts` | 2,749 | Delete |
| `packages/ui/src/components/flow/flow-draft-editor.tsx` | 801 | Delete |
| `apps/backend/src/schema/task/task/task-transfer-service.ts` | 687 | Split later (out of core scope) |
| `apps/backend/src/schema/flow/flow-draft-service.ts` | 652 | Delete |
| `apps/backend/src/schema/flow/flow-start-service.ts` | 428 | Delete |
| `apps/backend/src/schema/task/task/task-service.ts` | 420 | Split validate/create/update/delete |
| `apps/backend/src/schema/flow/decision-review-service.ts` | 422 | Delete |
| `packages/ui/src/components/flow/next-task/next-task-wiring.tsx` | 451 | Rebuild as a molecule |
| `apps/backend/src/schema/flow/user-decision-revision-service.ts` | 349 | Delete; rebuild editor |
| `packages/ui/src/components/flow/flow-start-assistant.tsx` | 375 | Delete |
| `apps/backend/src/schema/task/queuedtask/queued-task-service.ts` | 310 | Split by use case |
| `packages/ui/src/components/landing/landing-run-step.tsx` | 235 | Split into molecules |
| `packages/ui/src/components/task/taskBuilder/taskBuilder.tsx` | 268 | Split container + organisms |

### 3.9 Testing

- No test files and no test framework.
- Only ad-hoc smoke scripts.
- The new domain must be testable in isolation; the plan therefore starts with
  a Vitest + Postgres harness.

---

## 4. Target experience

### 4.1 Landing page

1. User selects a starting task (no “let the model decide” sentinel).
2. User writes the state/prompt and optionally attaches files/folders.
3. With the setting on, submitting starts an **assisted run**.
4. The run appears immediately in the run list.
5. The current step shows:
   - task name and status,
   - a closed trace accordion,
   - when it finishes, an outcome review panel.
6. The user accepts, rejects/revises, or cancels.

### 4.2 Task queue

1. User edits a task in the builder. The form may be unsaved.
2. The task-builder assistant takes the current form draft and a prompt.
3. Starting runs the draft as an assisted run.
4. The same run timeline and review panels appear beside/below the builder.
5. Accepted revisions update the builder form and persist the task (or promote
   a draft task).
6. Cancel discards the draft run and leaves both the saved task and the builder
   form as they were before the run.

### 4.3 Tool step review loop

1. The tool executes against a checkpoint:
   - `state` and `toolState` before the step,
   - the task snapshot used for the attempt,
   - a trial workspace for file/todo effects.
2. The user sees “Is this outcome acceptable?” plus a change summary:
   - state/toolState additions or changes,
   - files created/updated/moved/deleted,
   - todos created/updated/deleted,
   - tool output and summary,
   - the full trace.
3. Accept:
   - commit the effect journal,
   - persist the task snapshot if it changed,
   - mark the step complete,
   - enqueue the next step.
4. Reject:
   - user describes the expected outcome,
   - the model proposes exactly one of:
     1. a new tool config for the same tool,
     2. a replacement tool/decision/user-decision task,
     3. a tool/task to run before, after, or before and after the current one,
     4. the next task in line as the fix.
   - the proposal is shown as a diff and can be edited before trying,
   - “Try this” runs the revised setup from the checkpoint,
   - the user reviews again. Repeat until accepted or cancelled.
5. Cancel drops the run; uncommitted effects are discarded; the task definition
   is unchanged.

### 4.4 Decision review loop

1. A System One decision runs and records the raw answer, effective answer,
   probabilities/confidence, matched result, and next task.
2. The user is asked “Is this the right choice?”
3. Accept: continue to the chosen branch.
4. Reject:
   - select the option/result that should have been chosen, or
   - create a new option.
5. If an existing different option is selected:
   - ask “Do you want to optimize the wording so the model chooses this next
     time?”
   - **No:** continue from the user’s choice for this run only.
   - **Yes:** the model refines premise/instruction/option descriptions (and
     thresholds only upward, never below 0.8), the decision is re-run, and the
     result is reviewed again.
   - Maximum 3 optimization attempts. On failure, offer:
     - use the user’s choice for this run,
     - edit the wording manually,
     - accept the model’s choice.
6. If the user wants a new option:
   - they describe it,
   - the model drafts label, description, value, and optional target,
   - the user previews/edits it,
   - the decision is re-run with the new option,
   - accepting persists the option and its result wiring.
7. If the selected option has no next task, the user must choose or create a
   target before continuing. This is the only surviving part of the old “wire
   decision target” behaviour.

### 4.5 User-decision review

- The user decision still pauses for the user to choose.
- While paused, the prompt, labels, descriptions, and targets can be edited.
- There is no model review and no automatic wording optimization.
- Saving edits is an explicit acceptance and persists them.
- After answering, the run continues.

### 4.6 Trace accordion

- One closed-by-default accordion per step attempt.
- The header shows a live status and a one-line summary.
- Opening it reveals every action:
  - step started,
  - checkpoint created,
  - task snapshot loaded,
  - tool started/finished,
  - state/toolState diff,
  - sandbox file/todo operations,
  - model request, streamed tokens, model response,
  - validation warnings,
  - revision proposal and applied revision,
  - decision attempts and confidence,
  - commit/discard result,
  - errors.
- Live events arrive over the existing SSE subscription transport.
- Stored events replay after reload.
- Trace rows are deleted when the run/queued task is deleted.

### 4.7 Accept, cancel, and prior state

- Accepting a step commits that step only.
- Previously accepted steps stay committed even if a later step is cancelled.
- Cancelling:
  - discards the current trial workspace and attempt,
  - deletes the run and its uncommitted attempts/traces,
  - deletes a draft task created only for this run,
  - leaves existing task/decision definitions at their last accepted state.
- There is no automatic version history after acceptance.

---

## 5. Domain model

### 5.1 Aggregates

```
Run (assisted)
└── Step (queuedTasks row)
    ├── checkpoint: beforeState, beforeToolState, taskSnapshot
    └── Attempt 1..n
        ├── status
        ├── taskSnapshot
        ├── trial workspace key
        ├── effect journal
        ├── result/output
        ├── review decision
        └── trace events
```

- A **run** owns the mode (`standard` or `assisted`) and run-level status.
- A **step** is the unit that appears in the queue and run timeline.
- An **attempt** is one execution of a step with a specific task snapshot.
- A **checkpoint** is the input state/toolState and task snapshot at the start of
  the step; it is reused by every revision attempt.
- An **effect journal** records sandboxed side effects and is replayed on accept.
- A **trace event** is an append-only record of observable work.

### 5.2 Assisted step state machine

```
queued
  -> running                 (attempt created)
  -> awaiting_step_review    (tool finished, effects staged)
  -> committed               (accepted)
  -> next step queued / run completed

running
  -> failed                  (execution failed; effects discarded)

awaiting_step_review
  -> revision_requested      (user rejected with feedback)
  -> running                 (new attempt from checkpoint)
  -> cancelled               (user cancelled the run)
```

### 5.3 Decision step state machine

```
queued -> running -> awaiting_decision_review
awaiting_decision_review
  -> committed               (accepted)
  -> override_committed      (user chose another result, this run only)
  -> optimizing              (0..3 attempts)
  -> option_pending          (new option proposed/applied)
  -> cancelled
```

### 5.4 User-decision state machine

```
queued -> running -> awaiting_user_choice
awaiting_user_choice
  -> options_edited          (staged, explicit save)
  -> committed               (answer recorded)
  -> cancelled
```

### 5.5 Invariants

1. No assisted step enqueues its successor before its own acceptance.
2. No trial effect reaches production files/todos before commit.
3. A revision re-runs from the original checkpoint, never from the rejected
   attempt’s output.
4. A rejected attempt is never partially committed.
5. A cancelled run never commits the current attempt.
6. Task/decision definitions change only during an accepted step or an explicit
   option save.
7. A model proposal is never trusted directly; it is validated, previewed, and
   editable.
8. Assisted runs execute at most one step at a time.
9. Decision optimization never lowers a threshold below 0.8.
10. Trace rows are scoped to the owning user/run and deleted with the run.
11. Assisted trial steps are not shown in the standard task queue. They are
    grouped under the assisted run and deleted on cancel. The underlying queue
    row is execution plumbing, not a committed queue change.
12. Draft tasks created for an unsaved builder draft are hidden from normal task
    lists/export and promoted or deleted at the end of the assisted run.

---

## 6. Target architecture

### 6.1 Backend module layout

```
apps/backend/src/assisted/
  domain/
    run.ts                     # run status transitions and invariants
    step.ts                    # step lifecycle
    attempt.ts                 # attempt lifecycle and checkpoint types
    review.ts                  # review kinds/outcomes
    revision.ts                # proposal types + validation rules
    decision.ts                # confidence normalization + 0.8 floor
    errors.ts                  # typed domain errors
  application/
    start-assisted-run.ts
    execute-attempt.ts
    commit-attempt.ts
    cancel-assisted-run.ts
    review-step.ts
    propose-step-revision.ts
    apply-step-revision.ts
    review-decision.ts
    optimize-decision.ts
    add-decision-option.ts
    edit-user-decision-options.ts
    clean-up-runs.ts
  infrastructure/
    repositories/
      run-repository.ts
      step-repository.ts
      attempt-repository.ts
      task-snapshot-repository.ts
      trace-repository.ts
    workspaces/
      workspace.ts             # port
      production-workspace.ts
      trial-workspace.ts
      effect-journal.ts
    trace/
      trace-sink.ts
      trace-context.ts
      trace-publisher.ts
    pubsub/
      assisted-events.ts
  graphql/
    assisted.ts
    mutations.ts
    subscriptions.ts
```

`apps/backend/src/schema/assisted/` contains only Pothos type definitions and
thin resolvers that call the application services.

### 6.2 Application layering

- **Domain** — pure functions and types, no DB, no GraphQL, no Ollama.
- **Application** — one use case per file, depends on ports.
- **Infrastructure** — Drizzle repositories, trial workspaces, pubsub, Ollama
  adapters.
- **GraphQL** — argument validation and mapping only.

Ports are small and injected:

```ts
interface RunRepository { ... }
interface AttemptRepository { ... }
interface Workspace {
  begin(attempt: AttemptRef): Promise<TrialHandle>;
  commit(handle: TrialHandle): Promise<CommitReport>;
  discard(handle: TrialHandle): Promise<void>;
}
interface TraceSink {
  event(kind: TraceKind, payload: unknown): void;
  modelToken(text: string): void;
}
interface RevisionPlanner {
  propose(input: RevisionInput): Promise<RevisionProposal>;
}
interface DecisionOptimizer {
  propose(input: DecisionOptimizationInput): Promise<DecisionOptimizationProposal>;
}
```

### 6.3 Execution pipeline

```
QueueScheduler
  -> claim step
  -> load or create Run
  -> StepExecutor
       -> load task snapshot
       -> create checkpoint (beforeState, beforeToolState)
       -> create attempt
       -> run with trace context
       -> for assisted: create trial workspace
       -> tool/decision/user-decision executor
       -> persist attempt result + effect journal
  -> ReviewPolicy
       -> standard: AutoCommitPolicy (commit + enqueue next)
       -> assisted: ReviewPolicy (await user review)
```

The executor returns an `AttemptResult`; it never writes statuses or enqueues
next steps directly. Status transitions and enqueueing live in the application
services.

### 6.4 Task snapshots

A snapshot contains everything needed to execute a step without reading live
definition rows:

```ts
interface TaskSnapshot {
  task: TaskDefinition;
  decision?: DecisionDefinition;
  results?: DecisionResultDefinition[];
  userDecisionOptions?: UserDecisionOptionDefinition[];
}
```

- Snapshots are created when a step starts.
- Revisions produce a new snapshot.
- Accepting a step with a changed snapshot commits it to `tasks` / `decisions` /
  `taskResults` / `userDecisionOptions`.
- Standard runs create snapshots too, so execution has one path; they auto-commit
  immediately.

### 6.5 Sandbox and effect journal

Only tools that declare side effects participate.

- Add `ToolDefinition.sideEffects: ("files" | "todos")[]` and
  `ToolDefinition.trialSafe: boolean`.
- Refactor file tools to use a `FileWorkspace` port instead of direct filesystem
  and `fileEntries` access.
- Refactor todo tools to use a `TodoWorkspace` port instead of direct `db`
  access.
- `ProductionWorkspace` writes directly, matching current behaviour.
- `TrialWorkspace`:
  - keeps files in `FILES_ROOT/.trials/<runId>/<attemptId>/`,
  - uses copy-on-write semantics: reads fall back to the production tree, writes
    go to the trial tree, deletes are tombstones,
  - records operations in an `EffectJournal`,
  - stages todo/file-entry inserts/updates/deletes as journal operations and
    overlays reads,
  - defers embeddings until commit,
  - exposes trial content URLs for previews.
- Commit replays the journal into production in a DB transaction where possible
  and a filesystem apply step; commit is idempotent and reports failures.
- Discard removes the trial directory and drops the journal.
- A periodic/orphan cleanup removes `.trials` directories with no live attempt.

Tools without `trialSafe: true` cannot run inside an assisted attempt. The UI
explains why and offers to run them in a standard run instead. This keeps the
sandbox boundary honest instead of pretending every tool is reversible.

### 6.6 Revision engine

The revision planner receives:

- the current task snapshot,
- the checkpoint state/toolState,
- the attempt result and effect summary,
- the user’s expected outcome,
- existing tasks and the tool catalog,
- the current flow neighborhood (next/fallback/branch targets).

It returns one validated proposal:

```ts
type RevisionKind =
  | "updateToolConfig"
  | "replaceTask"
  | "insertBefore"
  | "insertAfter"
  | "insertBeforeAndAfter"
  | "runNext";

interface RevisionProposal {
  kind: RevisionKind;
  explanation: string;
  confidence: number;
  taskPatch?: Partial<TaskDefinition>;
  replacement?: TaskDraft;
  insertions?: TaskDraft[];
  nextTaskId?: number | null;
  warnings: string[];
}
```

Validation rules:

- `updateToolConfig` keeps the same tool key; config passes tool validation.
- `replaceTask` supports tool, decision, and user-decision drafts. A decision
  needs at least two options and at least one wired result target unless the
  user is prepared to wire it during review.
- `insertBefore` / `insertAfter` / both:
  - drafts validate,
  - max two insertion tasks per proposal,
  - no cycles, no self-reference,
  - chain depth stays within `MAX_CHAIN_DEPTH`,
  - wiring is explicit and previewed.
- `runNext` resolves the current task’s next target. If none exists, the planner
  must propose one or ask the user to choose.
- Proposals that only “fix” the outcome by weakening safety/validation are
  rejected.
- Every proposal has a human-readable diff preview and is editable before “Try
  this”.

Execution semantics:

- `updateToolConfig`: new attempt with the same task and revised config.
- `replaceTask`: new attempt with the replacement snapshot; accept persists the
  replacement in place of the original task or swaps the queued step’s task.
- `insertBefore`: new tasks run first from the checkpoint; on accept they are
  persisted and wired before the current task, then the current task runs.
- `insertAfter`: the current task result is retained, the inserted task runs
  from the current attempt’s output; on accept it is wired after the current
  task and before the old next target.
- `insertBeforeAndAfter`: both of the above in order.
- `runNext`: the current step is accepted as “skip” and the next task runs with
  the checkpoint state/toolState; the user may persist the skip as a flow edit
  or keep it run-only.

### 6.7 Decision engine

- `DecisionExecutor` returns an attempt with:
  - raw answer,
  - effective answer (never biased),
  - probabilities/confidence,
  - matched result id and target,
  - normalized confidence,
  - low-confidence flag.
- Assisted decision review is a first-class review kind.
- `DecisionOptimizer` proposals may change:
  - decision premise,
  - instruction,
  - option names and descriptions,
  - thresholds (only upward; minimum 0.8),
  - result wiring for a new option.
- It must preserve the user’s expected result as an available option/result.
- Each optimization attempt is a new attempt from the checkpoint, up to 3.
- A manual override is recorded in the attempt/step result and affects this run
  only.
- `noul` and `score` decisions use normalized confidence:
  - `score / max(1, legendSize - 1)`,
  - `noul` as supplied in 0..1.
- Low-confidence answers are never silently treated as correct for assisted
  decisions.

### 6.8 Trace and streaming

New package: `packages/observability` (or a focused module if a package is
undesirable) with:

- `TraceSink` interface,
- `AsyncLocalStorage` trace context,
- event types and redaction helpers.

Instrumentation:

- `@repo/ai` emits model request, token chunks (when streaming), response,
  model name, duration, and errors.
- `@repo/tools` and workspace ports emit tool start/finish, file/todo
  operations, and effect-journal changes.
- The attempt executor emits step/attempt/checkpoint/review/commit events.
- Backend persists events to `traceEvents` with a per-run sequence number.
- GraphQL subscription `assistedTraceEvent(runId)` streams live events over SSE.
- A query replays stored events for an attempt.
- Trace payloads are truncated and redacted; file contents are referenced by
  trial path/preview URL, not embedded repeatedly.
- The UI keeps the accordion closed by default and appends live lines only when
  open.

### 6.9 Queue refactor

Split the current processor:

- `queue/scheduler.ts` — select/claim/launch, priority, parallel policy.
- `queue/step-executor.ts` — dispatch to the correct executor.
- `queue/processors/tool-step.ts` — execute only, return an `AttemptResult`.
- `queue/processors/decision-step.ts` — same.
- `queue/processors/user-decision-step.ts` — same.
- `queue/commit-policy.ts` — auto-commit vs review.
- `queue/run-control.ts` — enqueue next / complete run / cancel.

Assisted runs force:

- one active step per run,
- no parallel-capable shortcut,
- no prioritized jump that would overlap a reviewed run,
- no next-step enqueue until accept.

Standard runs keep current parallel/priority semantics.

Queue visibility is split:

- `activeQueuedTasks` / the standard task-queue view returns standard runs only.
- Assisted steps are read through `assistedRun` and the run timeline.
- If an assisted step uses the same `queuedTasks` table for execution, it is
  filtered out of the standard queue list and removed with the run on cancel.
  This keeps the user’s task queue unchanged for unaccepted trials.

### 6.10 GraphQL API sketch

Types:

```graphql
enum AssistedRunStatus {
  running
  awaiting_step_review
  awaiting_decision_review
  awaiting_user_choice
  completed
  cancelled
  failed
}

type AssistedRun {
  id: ID!
  status: AssistedRunStatus!
  state: String
  startTaskId: Int!
  steps: [AssistedStep!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type AssistedStep {
  id: Int!
  taskId: Int!
  taskName: String
  depth: Int!
  status: QueuedTaskStatus!
  attempts: [StepAttempt!]!
  currentAttempt: StepAttempt
  review: StepReview
}

type StepAttempt {
  id: Int!
  attemptNumber: Int!
  kind: AttemptKind!
  status: AttemptStatus!
  taskSnapshot: JSON!
  beforeState: String!
  beforeToolState: JSON!
  afterState: String
  afterToolState: JSON
  result: JSON
  effects: JSON
  summary: String
  createdAt: DateTime!
  committedAt: DateTime
}

union StepReview =
    ToolStepReview
  | DecisionStepReview
  | UserDecisionReview
```

Mutations:

- `startAssistedRun(input: StartAssistedRunInput!): AssistedRun!`
- `acceptStepAttempt(attemptId: Int!): AssistedRun!`
- `requestStepRevision(attemptId: Int!, feedback: String!): RevisionProposal!`
- `applyStepRevision(attemptId: Int!, proposal: JSON!): AssistedRun!`
- `reviewDecision(attemptId: Int!, accept: Boolean!): AssistedRun!`
- `overrideDecision(attemptId: Int!, resultId: Int!): AssistedRun!`
- `optimizeDecision(attemptId: Int!, expectedResultId: Int!, feedback: String): AssistedRun!`
- `proposeDecisionOption(attemptId: Int!, prompt: String!): DecisionOptionProposal!`
- `applyDecisionOption(attemptId: Int!, option: JSON!): AssistedRun!`
- `saveUserDecisionOptions(attemptId: Int!, options: JSON!): AssistedRun!`
- `cancelAssistedRun(runId: ID!): Boolean!`
- `deleteAssistedRun(runId: ID!): Boolean!`

Queries:

- `assistedRun(runId: ID!): AssistedRun`
- `activeAssistedRuns: [AssistedRun!]!`
- `attemptTrace(attemptId: Int!): [TraceEvent!]!`

Subscriptions:

- `assistedTraceEvent(runId: ID!): TraceEvent!`

Existing `queuedTaskEvent` remains for queue status updates. Assisted-specific
events should not overload `pendingChoice` with five different meanings.

`StartAssistedRunInput` includes:

- `taskId: Int` (optional when starting from a builder draft),
- `taskSnapshot: JSON` (current builder draft or verified saved task),
- `state: String!`,
- `fileIds`, `folderIds`.

### 6.11 Frontend atomic design

New component tree:

```
packages/ui/src/components/assisted/
  atoms/
    status-badge.tsx
    confidence-badge.tsx
    delta-row.tsx
    trace-event-line.tsx
    json-diff.tsx
    choice-item.tsx
  molecules/
    step-outcome-summary.tsx
    state-delta-list.tsx
    review-actions.tsx
    feedback-field.tsx
    trace-accordion.tsx
    decision-choice-list.tsx
    option-editor-row.tsx
    revision-preview.tsx
    composer-field.tsx
  organisms/
    assisted-composer.tsx
    run-timeline.tsx
    step-review-panel.tsx
    decision-review-panel.tsx
    user-decision-option-panel.tsx
    attempt-trace-panel.tsx
    task-builder-assistant-panel.tsx
  templates/
    assisted-landing-template.tsx
    task-builder-template.tsx
  hooks/
    use-assisted-run.ts
    use-attempt-trace.ts
    use-step-review.ts
    use-decision-review.ts
    use-assisted-composer.ts
```

Rules:

- **Atoms** < 50 lines, one visual element, tokens only.
- **Molecules** < 100 lines, compose atoms, one interaction pattern.
- **Organisms** < 200 lines, compose molecules/atoms, one feature area.
- **Templates** < 250 lines, arrange organisms and slots.
- Components are presentational: data via props, events via callbacks.
- GraphQL lives only in hooks/containers.
- No direct `useMutation`/`useQuery` in atoms/molecules/organisms.
- Reuse existing UI atoms: `Button`, `Badge`, `Field`, `Textarea`, `Spinner`,
  `Collapsible`, `Trace`, `ChainOfThought`.
- Add semantic tokens for confidence low/high, diff add/remove, review pending,
  and trace status; no raw colour values.
- Accessibility: labelled controls, radio groups for choices, `aria-live` for
  live trace status, focus moves to the review panel when it appears, keyboard
  operable accordions.

Landing page becomes `AssistedLandingTemplate`:
- composer organism,
- run timeline organism,
- no flow-start assistant.

Task queue becomes `TaskBuilderTemplate`:
- flow graph (unchanged),
- builder (refactored from `taskBuilder.tsx`),
- assistant panel organism,
- run timeline for the current assisted run.

### 6.12 SOLID and readability rules

- One use case per file; no “do everything” services.
- Queue processors execute; application services decide; repositories persist.
- Strategy pattern for revision kinds: one handler per kind behind a common
  interface.
- Strategy pattern for commit policy: auto-commit vs review.
- Dependency inversion for workspace, trace, model gateway, clock, and IDs.
- Narrow interfaces instead of one giant `ToolRunContext`; add `trace` and
  `workspace` capabilities explicitly.
- No direct `db`/`fs` calls inside tool implementations; use ports.
- No GraphQL types inside domain/application.
- No domain logic inside resolvers.
- File budgets:
  - domain modules < 200 lines,
  - application use cases < 200 lines,
  - infrastructure adapters < 250 lines,
  - no new non-generated file above 300 lines without a documented reason.
- Delete dead code before refactoring; do not keep compatibility shims for the
  unmerged branch.

---

## 7. Data model changes

### 7.1 Remove

- `decisionBiases` table.
- `decisionFeedback` table.
- `queuedTasks.autoPlanned`.
- `queuedTasks.flowGoal`.
- `queuedTasks.runReview`.
- `queuedTasks.nextStepApproved`.
- `decisions.biases` relation and `DecisionBias` GraphQL object.
- Flow planner/draft/proposal/start/run-review tables or columns added by the
  branch (none beyond queue columns).

### 7.2 Rename

- `userSettings.flowAutoImprovement` → `userSettings.autoImprovement`.
- GraphQL `flowAutoImprovement` → `autoImprovement`.
- UI label: **Assisted runs (auto improvement)**.

### 7.3 Add

`runs`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Replaces implicit run grouping |
| `userId` | int FK users | Owner |
| `mode` | enum `runMode` (`standard`, `assisted`) | Review policy |
| `status` | enum `runStatus` | running/awaiting step/decision/user/completed/cancelled/failed |
| `state` | text | Original run state |
| `startTaskId` | int FK tasks | Starting task |
| `createdAt`, `updatedAt` | timestamptz | |
| `parentRunId` | uuid nullable | Optional for later retries/revisions |

`queuedTasks`:

- `runId` becomes an FK to `runs.id`.
- Keep `state`, `toolState`, `taskId`, `depth`, `status`, `result`,
  `pendingChoice`, `queued_by`, models, timestamps.
- Add `attemptCount` only if it cannot be derived from attempts.

`stepAttempts`:

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `queuedTaskId` | int FK queuedTasks cascade | |
| `runId` | uuid FK runs cascade | |
| `attemptNumber` | int | 1..n per step |
| `kind` | enum (`initial`, `revision`, `replay`) | |
| `status` | enum (`running`, `succeeded`, `failed`, `cancelled`, `committed`) | |
| `taskSnapshot` | jsonb | Full executable snapshot |
| `beforeState` | text | Checkpoint |
| `beforeToolState` | jsonb | Checkpoint |
| `afterState` | text nullable | |
| `afterToolState` | jsonb nullable | |
| `result` | jsonb | Output, branch, answer, etc. |
| `effectJournal` | jsonb | Staged operations |
| `revision` | jsonb nullable | Proposal that produced this attempt |
| `review` | jsonb nullable | Accept/reject/override metadata |
| `workspaceKey` | text nullable | Trial directory |
| `createdAt`, `finishedAt`, `committedAt` | timestamptz | |

`traceEvents`:

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `runId` | uuid FK runs cascade | |
| `attemptId` | int FK stepAttempts cascade nullable | |
| `sequence` | int | Monotonic within run |
| `kind` | text | Event kind |
| `payload` | jsonb | Redacted/truncated |
| `createdAt` | timestamptz | |

`tasks`:

- `isDraft` boolean default false.
- `draftOwnerId` int nullable FK users.
- Draft tasks are hidden from normal task lists/export and deleted on cancel.
- On acceptance, promote to active and clear the draft owner.

Indexes:

- `runs(status, userId)`.
- `stepAttempts(queuedTaskId, attemptNumber)` unique.
- `traceEvents(runId, sequence)`.
- `traceEvents(attemptId, sequence)`.
- `queuedTasks(runId, depth)`.

---

## 8. Removal plan

### 8.1 Backend files to delete

- `apps/backend/src/queue/decision-bias.ts`
- `apps/backend/src/scripts/flowBiasSmoke.ts`
- `apps/backend/src/queue/gate-next-step.ts`
- `apps/backend/src/queue/confirm-next-step.ts`
- `apps/backend/src/schema/flow/decision-review-service.ts`
- `apps/backend/src/schema/flow/decision-review.ts`
- `apps/backend/src/schema/flow/flow-decision-target-service.ts`
- `apps/backend/src/schema/flow/flow-draft-service.ts`
- `apps/backend/src/schema/flow/flow-mutations.ts`
- `apps/backend/src/schema/flow/flow-plan-service.ts`
- `apps/backend/src/schema/flow/flow-proposal-service.ts`
- `apps/backend/src/schema/flow/flow-run-review-service.ts`
- `apps/backend/src/schema/flow/flow-start-service.ts`
- `apps/backend/src/schema/flow/flow.ts`
- `apps/backend/src/schema/flow/index.ts`
- `apps/backend/src/schema/flow/user-decision-revision-service.ts`
- `apps/backend/src/schema/flow/user-decision-revision.ts`

Keep `structured-generation.ts`, but move it under the assisted generation
infrastructure and remove flow-specific assumptions.

### 8.2 UI files to delete

- `packages/ui/src/components/flow/flow-start-assistant.tsx`
- `packages/ui/src/components/flow/use-flow-start-assistant.ts`
- `packages/ui/src/components/flow/flow-draft-editor.tsx`
- `packages/ui/src/components/flow/flow-model.ts`
- `packages/ui/src/components/flow/decision-review/*`
- `packages/ui/src/components/flow/user-decision-revision/*`
- `packages/ui/src/components/flow/next-task/*`
- `packages/ui/src/components/flow/task-target-select.tsx`
- `packages/ui/src/components/landing/next-step-gate.tsx`
- `packages/ui/src/components/landing/run-review-panel.tsx`
- `packages/ui/src/components/landing/use-landing-plan.ts`
- `packages/ui/src/components/task/taskBuilder/components/taskBuilderAssistant.tsx`
- Old flow assistant wiring in `landing.tsx`, `use-landing-page.ts`,
  `landing-composer.tsx`.

Rebuild the useful pieces as smaller molecules under `components/assisted`.

### 8.3 Queries/GraphQL removals

- Remove flow proposal/draft/confirm/plan/run-review mutations and generated
  types.
- Remove decision review/bias queries and `DecisionBias`.
- Remove `autoPlanned`, `flowGoal`, `runReview`, `nextStepApproved` selections.
- Regenerate all GraphQL types after schema changes.
- Update `packages/queries/src/flow/*`: keep only files reused by the new
  assisted API, then move them under `queries/assisted/`.

### 8.4 Documentation

- Replace README “Flow auto improvement” with “Assisted runs”.
- Remove migration rollback SQL for bias/flow tables.
- Document sandbox behaviour, trace retention, sequential execution, and the
  fact that accepted revisions have no version history.

### 8.5 Cut candidates to verify

- `textPrompt` task type appears unused at runtime. Remove it from the enum, UI,
  and export/import format if no external files must be preserved; otherwise
  keep it deprecated. Do not block the main refactor on this.
- `task-transfer-service.ts` (687 lines) is not part of this refactor, but should
  be split in a follow-up.
- `queued-task-service.ts` should be split into create/retry/dismiss/delete use
  cases.
- `task-service.ts` should be split into validation/create/update/delete.

---

## 9. Migration strategy

The branch is not merged. Prefer rewriting the branch-local migrations rather
than layering cleanup migrations on top of experiments that will be deleted.

1. Delete the unreleased migrations added by this branch, including
   `20261120224410_mysterious_bishop`.
2. Generate a clean migration set from the final schema.
3. If a development database must be preserved, add a forward migration that:
   - creates `runs` and backfills one row per existing `queuedTasks.runId`
     (`mode = standard`, status derived from rows),
   - creates `stepAttempts` and `traceEvents`,
   - adds `tasks.isDraft` / `draftOwnerId`,
   - renames `flowAutoImprovement` to `autoImprovement`,
   - drops the bias/flow tables and queue columns.
4. Backfill or mark existing runs as standard; they must never be gated.
5. Do not attempt to recover old bias data.

---

## 10. Test strategy

### 10.1 Tooling

- Add Vitest at the workspace level.
- Add a disposable Postgres test service (Docker compose profile) and a test
  migration/truncate helper.
- Add React Testing Library + jsdom for UI atoms/molecules/organisms.
- Add a fake model adapter with scripted System One/generation responses.
- Use a temporary `FILES_ROOT` per test.
- Keep `pnpm check-types`, `pnpm lint`, `pnpm build`, and `pnpm codegen` green
  at every phase.

### 10.2 Test layers

- **Unit:** domain state machines, threshold normalization, proposal validation,
  effect journal apply/discard, trace ordering.
- **Integration:** repositories, sandbox file/todo commit/discard, assisted run
  execution, revision kinds, decision optimization, cancellation.
- **Contract:** GraphQL schema and generated query types.
- **Component:** atoms/molecules/organisms with mock props.
- **Manual/end-to-end:** golden scenarios with a fake model or local Ollama.

### 10.3 Golden scenarios

1. **Create folder/file**
   - Start an assisted run with a task that creates folder `abc` and a markdown
     file containing the alphabet.
   - Trial creates nothing in production.
   - Review shows folder/file effects.
   - Accept commits both.
2. **Reject tool outcome and revise config**
   - Reject the folder name `abc`; ask for `alphabet`.
   - Model proposes a new tool config.
   - Re-run uses the checkpoint and produces `alphabet`.
   - Accept commits only `alphabet`.
3. **Replace tool**
   - Reject a folder creation; replace with a file creation task.
   - Accept persists the replacement.
4. **Insert before/after**
   - Reject a file content outcome; insert a prompt task before the file
     creation, and a formatting task after it.
   - Accept persists the wiring.
5. **Run next task**
   - Reject the current tool; choose “run the next task in line”.
   - Continue from the next task with the checkpoint state.
6. **Decision wrong, override only**
   - Model chooses A; user chooses B; decline optimization.
   - Run continues from B; decision definition is unchanged.
7. **Decision wrong, optimize**
   - Model chooses A; user chooses B; optimize wording.
   - First two attempts still choose A; third chooses B with confidence >= 0.8.
   - Accept persists the wording and thresholds.
8. **Decision optimization cannot succeed**
   - Three attempts fail; user chooses “use my choice this run”.
   - Definition unchanged.
9. **New decision option**
   - User describes a missing option; model drafts it; re-run; accept persists
     option and wiring.
10. **User decision edit**
    - User edits prompt/option while waiting; save persists; answer continues.
11. **Cancel**
    - Cancel after a rejected trial; no files/todos created; task unchanged.
    - Cancel after an accepted step; that step’s changes remain.
12. **Trace**
    - Trace streams tokens and tool actions; reload replays; delete history
      removes trace and trial artifacts.

### 10.4 Phase gates

Every phase must include:

- targeted unit/integration tests for new behaviour,
- regression tests for standard queue runs,
- type/lint/codegen checks,
- a short manual checklist where UI is involved,
- no new references to removed bias/planner code.

---

## 11. Phased implementation plan

### Phase 0 — Baseline, guardrails, and test harness

**Goal:** a clean, testable base before changing behaviour.

Work:

- Delete the untracked planner/run-review experiment and the branch-local
  migration that is not part of the target design.
- Add Vitest, DB test harness, RTL/jsdom, and fake model adapter.
- Add scripts: `test`, `test:unit`, `test:db`, `test:ui`.
- Add architecture guardrails:
  - no-restricted-imports rules for domain/application/infrastructure
    boundaries,
  - a file-size check script with the budgets in §6.12.
- Add baseline tests for the standard queue path.
- Regenerate GraphQL types from the current schema.

Tests:

- Standard create-queue-run smoke test with a deterministic tool.
- Type/lint/build/codegen pass.

Exit criteria:

- No planner experiment remains in the working tree.
- `pnpm test` runs the baseline suite.
- Standard runs behave exactly as on `main` for this phase.

---

### Phase 1 — Remove the bias mechanic completely

**Goal:** decisions no longer use learned bias anywhere.

Work:

- Delete `decision-bias.ts` and the bias smoke script.
- Remove bias imports/application from `decision-step.ts`; store only raw and
  effective (equal) answers.
- Delete decision review/bias backend services and GraphQL types.
- Drop `decisionBiases` and `decisionFeedback`; remove relations.
- Delete bias UI and generated query usage.
- Remove bias README sections and rollback SQL.

Tests:

- Decision execution uses the raw answer.
- No references to `Bias`, `decisionBiases`, or `decisionFeedback` remain.
- Existing decision result matching still works.
- Standard decision runs pass.

Exit criteria:

- Bias is fully gone; build/type/lint/tests pass.

---

### Phase 2 — Remove end-to-end flow creation and rename the feature

**Goal:** cut the planner/auto-start UX to the bone.

Work:

- Delete all flow proposal/draft/confirm/plan/run-review/gate/confirm-next-step
  backend modules and GraphQL mutations.
- Remove `autoPlanned`, `flowGoal`, `runReview`, `nextStepApproved` from schema
  and UI.
- Remove `AUTO_TASK_ID`; landing requires an explicit starting task.
- Remove flow assistant UI, draft editor, next-step gate, run review panel, and
  old task-builder assistant.
- Rename `flowAutoImprovement` → `autoImprovement` in DB/GraphQL/UI/queries.
- Keep `structured-generation` and task validation as reusable primitives, moved
  to `assisted` infrastructure.
- Rebuild decision-target wiring only when Phase 7 needs it; delete the old
  service now.

Tests:

- Landing creates a standard run with an explicit task.
- No “auto” sentinel or planner references remain.
- Setting toggles and persists.
- Standard flow graph/builder/import/export still work.

Exit criteria:

- No end-to-end planning or draft/confirm flow remains.
- Only the setting flag and reusable validation/generation primitives survive.

---

### Phase 3 — Runs, attempts, checkpoints, and trace persistence

**Goal:** foundational persistence for assisted runs.

Work:

- Add `runMode`/`runStatus` enums, `runs`, `stepAttempts`, and `traceEvents`.
- Add `tasks.isDraft` / `draftOwnerId`.
- Implement domain types and pure state machines.
- Implement repositories and use cases:
  - `start-assisted-run`,
  - `load-assisted-run`,
  - `create-attempt`,
  - `record-attempt`.
- Create run rows for all new standard/assisted submissions; backfill if
  required.
- Add GraphQL read model: `assistedRun`, `activeAssistedRuns`.
- Add basic trace persistence and a query replay (no streaming yet).
- Enforce assisted run ownership and draft visibility.

Tests:

- State machine unit tests.
- Start assisted run creates run + first queued step + attempt metadata.
- Draft task is hidden from normal task lists and visible to its owner.
- Standard run creation still works.
- Trace rows cascade on run deletion.

Exit criteria:

- Assisted run data can be created, queried, and deleted; nothing executes yet.

---

### Phase 4 — Trial workspace and effect journal

**Goal:** side effects can be staged and committed/discarded deterministically.

Work:

- Add `ToolDefinition.sideEffects` and `trialSafe`.
- Introduce `Workspace` port and `ProductionWorkspace`.
- Refactor file tools to use `FileWorkspace` (storage + file-entry repository).
- Refactor todo tools to use `TodoWorkspace`.
- Implement `TrialWorkspace`:
  - `.trials/<runId>/<attemptId>/` overlay,
  - copy-on-write reads/writes,
  - tombstones for deletes,
  - staged file-entry and todo operations,
  - deferred embeddings.
- Implement effect journal serialization and idempotent commit.
- Add trial content preview endpoint (signed token or owner-checked).
- Add orphan cleanup for trial directories.
- Mark non-trial-safe tools clearly.

Tests:

- File create/update/delete/move: production unchanged before commit; commit
  applies; discard leaves nothing.
- Todo create/update/delete/archive: production DB unchanged before commit;
  commit applies; discard leaves nothing.
- Read/find/scan tools see trial-created entries.
- Embeddings are computed on commit only.
- Commit failure is reported and leaves the attempt uncommitted.
- Path traversal/symlink escapes are rejected inside trial roots.
- Standard runs still write directly and pass existing tests.

Exit criteria:

- Every file/todo mutation tool is either trial-safe or explicitly rejected in
  assisted runs.

---

### Phase 5 — Assisted execution and tool-step review

**Goal:** end-to-end assisted tool step with accept/reject/cancel.

Work:

- Split the queue processor into scheduler, executor, commit policy, and
  run-control modules.
- Refactor processors to return `AttemptResult` instead of finishing/enqueuing.
- Implement `execute-attempt`:
  - snapshot -> checkpoint -> trial workspace -> trace context -> execute.
- Implement `ReviewPolicy` for assisted runs; auto-commit for standard runs.
- Implement `acceptStepAttempt`:
  - commit effects,
  - commit snapshot changes (none yet),
  - mark step complete,
  - enqueue next step or complete run.
- Implement `cancel-assisted-run` for the current attempt.
- Add GraphQL mutations and a minimal review panel/read model.
- Force assisted runs to execute one step at a time.
- Filter assisted steps out of the standard task-queue query/UI; they are only
  visible through the assisted run timeline.
- Emit trace events for start/finish/effects.

Tests:

- Deterministic create-file tool: run -> awaiting review -> production unchanged
  -> accept -> file exists -> next step queued.
- Reject/cancel before accept -> no file exists; task unchanged.
- Standard run auto-commits and keeps parallel/priority behaviour.
- Assisted steps do not appear in `activeQueuedTasks`/the standard queue view.
- Sequential enforcement for assisted runs, including foreach children.
- Ownership checks on accept/cancel.

Exit criteria:

- A complete assisted tool step works through the API and is testable without
  the final UI.

---

### Phase 6 — Step revision engine (four strategies)

**Goal:** the model can repair a rejected tool outcome in all four ways.

Work:

- Add generation infrastructure for structured revision proposals.
- Define and validate `RevisionProposal` types.
- Implement `propose-step-revision` and `apply-step-revision`.
- Add diff preview and editable proposal payload.
- Implement strategies:
  - **6a** `updateToolConfig` and `replaceTask`.
  - **6b** `runNext`.
  - **6c** `insertBefore`, `insertAfter`, and `insertBeforeAndAfter`.
- Persist revision metadata on the new attempt.
- Accept commits the revised snapshot/task/flow edits; reject/cancel leaves
  definitions unchanged.
- Add max-two insertions, cycle detection, depth limits, and tool-config
  validation.
- Add trace events for proposal, validation, and re-run.

Tests:

- Each strategy produces a valid attempt from the checkpoint.
- Invalid tool configs/cycles/unknown tools are rejected with actionable errors.
- Revised attempt receives the original checkpoint state/toolState.
- Accept persists; reject/cancel does not.
- `runNext` resolves fallback/result targets and handles no-target.
- Insert-before/after ordering and state/toolState flow are correct.
- Replacing with a decision/user-decision validates options/results.

Exit criteria:

- All four repair strategies work end-to-end and are covered by integration
  tests.

---

### Phase 7 — Decision review, optimization, and new options

**Goal:** the decision loop described in §4.4.

Work:

- Extend the decision executor to record normalized confidence and matched
  result.
- Add `awaiting_decision_review` status and read model.
- Implement `reviewDecision` accept/reject.
- Implement manual override for this run only.
- Implement `DecisionOptimizer`:
  - generation proposal for premise/instruction/options/descriptions,
  - threshold validation (>= 0.8, only upward),
  - preserve expected result,
  - re-run up to 3 attempts,
  - compare result and present success/failure.
- Implement new-option proposal/apply:
  - model drafts option + description + target,
  - preview/edit,
  - re-run,
  - accept persists option/result rows.
- Implement unwired-result target selection using a small `TaskTargetSelect`
  molecule and a simplified wiring service.
- Delete any remaining old decision review/wiring code.
- Add trace events for decision prompts, answers, confidence, optimization
  attempt numbers, and proposals.

Tests:

- Accept/continue with no changes.
- Reject + override with no optimization: run continues from user choice;
  definition unchanged.
- Optimize success: third attempt chooses expected result; accept persists.
- Optimize failure: after 3 attempts, fallback choices work.
- Thresholds below 0.8 are rejected/clamped and never accepted.
- New option proposal/apply/re-run/accept.
- `noul`/`score` normalization and review.
- Unwired result forces target selection before continuing.
- No bias code is used.

Exit criteria:

- Decision review and optimization are complete and testable via API.

---

### Phase 8 — User-decision editing and cancellation semantics

**Goal:** complete the remaining review paths and run lifecycle.

Work:

- Add user-decision option editing while awaiting input:
  - prompt, labels, descriptions, values, targets,
  - staged until explicit save,
  - save commits and re-renders options.
- Add optional post-answer “edit wording/options” action (no model call).
- Implement final cancellation semantics:
  - discard current trial,
  - delete uncommitted attempts/traces,
  - delete draft task if new,
  - mark/delete run according to the “dropped” UX,
  - keep previously accepted step changes.
- Extend history delete mutation to remove attempts, traces, and trial dirs.
- Add orphan/cleanup job for abandoned trial workspaces.

Tests:

- Editing options while waiting stages changes; save persists; cancel discards.
- Answering continues the run.
- Cancel after accepted step keeps accepted changes.
- Cancel before accept leaves task/file/todo state unchanged.
- History delete removes traces/attempts/trial artifacts.
- Cross-user access denied.

Exit criteria:

- User decisions and cancellation behave exactly as specified.

---

### Phase 9 — Trace capture and streaming backend

**Goal:** every action and model output is observable live and after reload.

Work:

- Add `packages/observability` with `TraceSink`, async context, event types, and
  redaction.
- Instrument `@repo/ai` for request, streamed tokens, response, duration, and
  errors.
- Instrument `@repo/tools`/workspaces for tool and effect operations.
- Persist events with per-run sequence numbers.
- Add `attemptTrace` query and `assistedTraceEvent` SSE subscription.
- Add backpressure/truncation rules for large payloads.
- Ensure trace is scoped to the owner and redacts secrets.
- Add trace cleanup on run/queued-task deletion.

Tests:

- Event ordering and sequence numbers.
- Token chunks arrive in order and are persisted.
- Replay returns the same events.
- Large payloads are truncated safely.
- Secrets/authorization headers are not stored.
- Unauthorized subscriptions/queries are rejected.
- Deletion cascades.

Exit criteria:

- A complete assisted run produces a live, replayable, redacted trace.

---

### Phase 10 — UI rebuild with atomic design

**Goal:** replace the rough assistants with the final, legible UX.

Work:

- Build atoms under `components/assisted/atoms`.
- Build molecules: outcome summary, delta list, review actions, feedback field,
  trace accordion, decision choice list, option editor row, revision preview,
  composer field.
- Build organisms: assisted composer, run timeline, step review panel, decision
  review panel, user-decision option panel, attempt trace panel, task-builder
  assistant panel.
- Build templates: assisted landing, task-builder workspace.
- Build container hooks for assisted run, trace, step review, decision review,
  and composer.
- Landing:
  - explicit task select,
  - state/prompt composer,
  - run timeline,
  - no flow assistant.
- Task queue:
  - current builder draft is the test target,
  - assistant starts an assisted run from the draft,
  - accepted revisions update the builder form,
  - cancel leaves the form and saved task untouched.
- Add semantic tokens for confidence/diff/review states.
- Add accessibility, focus management, and reduced-motion handling.
- Delete all old flow/landing review components.
- Keep the trace accordion closed by default; show a live status line.

Tests:

- RTL tests for atoms/molecules/organisms with mock props.
- Hook tests with mocked Apollo for start/accept/reject/optimize/cancel.
- Manual golden path on landing and task queue.
- Accessibility checks: labels, keyboard choice selection, accordion toggles,
  `aria-live` trace status.
- Token audit: no raw colour values in new components.

Exit criteria:

- Landing and task queue both provide the target experience with no flow
  assistant or bias UI.

---

### Phase 11 — Hardening, documentation, and final cut

**Goal:** production-ready assisted runs and no leftovers.

Work:

- Run all golden scenarios from §10.3 with fake and real models.
- Verify disk usage and cleanup of `.trials`.
- Verify commit idempotency and retry after simulated DB/file failures.
- Verify cancellation during running, review, optimization, and commit.
- Verify standard runs are completely unaffected.
- Rewrite README:
  - assisted runs,
  - sandbox behaviour,
  - sequential execution,
  - decision 0.8 rule,
  - trace retention,
  - no version history,
  - migration notes.
- Delete unused dependencies, generated code, scripts, and dead types.
- Run `pnpm check-types`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm codegen`.
- Perform an atomic-design audit against the skill checklist.
- Perform a SOLID audit: no use case over 200 lines, no new file over 300
  without justification, no GraphQL/db/fs in presentational components.

Exit criteria:

- Final acceptance checklist in §12 is fully green.

---

## 12. Final acceptance checklist

### Behaviour

- [ ] Setting off: standard queue runs are unchanged.
- [ ] Setting on: only runs started through the landing/task-queue assistant are
      assisted and reviewed.
- [ ] Starting task is explicitly selected; no model-chosen auto start.
- [ ] Assisted runs execute one step at a time.
- [ ] Tool step pauses after execution for outcome review.
- [ ] Trial files/todos never reach production before accept.
- [ ] Accept commits effects and revised definitions.
- [ ] Reject re-runs from the original checkpoint.
- [ ] All four repair strategies work.
- [ ] Decision review supports accept, run-only override, optimization, and new
      option.
- [ ] Optimization is capped at 3 attempts and never accepts <0.8 confidence.
- [ ] User-decision review is option editing only.
- [ ] Cancel drops the run and uncommitted effects; task definitions stay at
      their last accepted state.
- [ ] Previously accepted steps remain after a later cancel.
- [ ] Trace is live, replayable, closed by default, and deleted with the run.

### Architecture

- [ ] Bias code/tables/UI/docs removed.
- [ ] Flow planner/proposer/draft/confirm/run-review removed.
- [ ] No `autoPlanned`, `flowGoal`, `runReview`, `nextStepApproved`.
- [ ] Runs/attempts/checkpoints/effect journals/trace are first-class.
- [ ] Queue processors execute only; application services decide and persist.
- [ ] Revision and commit policies use strategies, not branching monoliths.
- [ ] Tools use workspace/repository ports, not direct db/fs.
- [ ] GraphQL resolvers are thin.
- [ ] Frontend is atomic-design structured and presentational.
- [ ] Design tokens are used for visual properties.
- [ ] No raw values in new components.

### Quality

- [ ] Unit, integration, contract, and component tests pass.
- [ ] Golden scenarios pass.
- [ ] Type/lint/build/codegen pass.
- [ ] README and architecture notes updated.
- [ ] No dead flow/bias references or generated leftovers.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sandbox complexity grows beyond files/todos | Declare `sideEffects`/`trialSafe` on tools; reject non-safe tools in assisted runs; scope initial support to file/todo tools. |
| Holding DB transactions across user review | Never hold a transaction; use effect journal + overlay, replay on commit. |
| Partial commit failure | Idempotent journal, attempt `commit_failed` state, retry/discard controls, atomic DB transaction where possible. |
| Trial disk usage | Cleanup on cancel/delete, orphan sweep, size limits per attempt. |
| File path/symlink escape in trials | Reuse existing path guards; trial root is absolute; reject symlinks; tests for traversal. |
| Model proposes unsafe/invalid revisions | Strict validation, diff preview, editable proposal, max insertions, cycle/depth checks. |
| Review fatigue with foreach | Sequential child review; consider an “accept remaining children” action later (not in this plan). |
| Sequential runs are slow | Acceptable for reviewed UX; keep standard runs parallel. |
| GraphQL/codegen churn | Regenerate at every phase; contract tests. |
| Migration complexity | Branch unmerged: rewrite migrations; provide forward migration only if a dev DB must be preserved. |
| UI complexity | Atomic design boundaries, file budgets, RTL tests, presentational-only components. |
| Trace privacy/secret leakage | Redaction allowlist, truncation, owner-scoped queries/subscriptions. |
| Task drafts leaking into global workspace | `isDraft` + owner checks; hide from lists/export; delete on cancel. |

---

## 14. Assumptions and follow-up checks

1. The branch is unmerged, so branch-local migrations may be rewritten. If a
   shared development database must be preserved, Phase 0 must produce a
   forward migration instead.
2. “No changes to files/todos until accepted” applies to tools that declare
   file/todo side effects. Network/model calls and read-only tools are not
   themselves rollbackable; their outputs are captured in the attempt/trace.
3. A tool that is not marked `trialSafe` cannot run in an assisted attempt. The
   UI must explain this and offer a standard run.
4. The 0.8 confidence floor applies to assisted decision review and generated
   thresholds; standard runs keep their existing configured thresholds until a
   later explicit change.
5. A new option or decision revision must have a valid next target before the
   run can continue. The user may create a draft target during review.
6. Foreach children are individual assisted steps and are reviewed
   sequentially. An “accept remaining” shortcut is out of scope for now.
7. “Dropped” means the run’s uncommitted attempts, traces, and trial workspace
   are deleted. Accepted step changes remain, because acceptance is per-step and
   there is no version history.
8. Task-queue assistant runs may use an unsaved form draft. The backend creates
   a draft task row for execution; it is promoted on acceptance and deleted on
   cancel.
9. Deleting queued-task history must also delete attempts, traces, and trial
   directories via cascade/cleanup.
10. `textPrompt` and `task-transfer-service.ts` are cleanup candidates but not
    blockers for this plan.

---

## 15. Suggested commit / review sequence

Each phase should land as one reviewable change (or a small series):

1. `chore: add test harness and architecture guardrails`
2. `refactor: remove decision bias`
3. `refactor: remove end-to-end flow creation`
4. `feat: add run, attempt, and trace persistence`
5. `feat: add trial workspace and effect journal`
6. `feat: execute assisted tool steps with review`
7. `feat: add step revision strategies`
8. `feat: add decision review and optimization`
9. `feat: add user-decision editing and cancellation semantics`
10. `feat: stream assisted run traces`
11. `feat: rebuild assisted UI with atomic design`
12. `docs: document assisted runs and finalize cleanup`

Do not squash phases 0–3 with the later feature work; the removals and
foundations should be reviewable independently.

---

## 16. Implementation status

The refactor is implemented on the `feature/self-improvement` working tree.
This section records what landed against the phases in §11 and what remains.

### Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 — Baseline, guardrails, test harness | **Partial** | Vitest is installed with `test`, `test:unit`, and `test:watch`. Only pure domain/services have unit tests (confidence normalization, revision validation, decision diffs, tool-config validation, file naming/user state, result matching; 44 tests). There is no DB integration harness, RTL/jsdom setup, fake model adapter, import-boundary lint rule, file-size budget script, or baseline standard-queue test yet. |
| 1 — Remove bias | **Complete** | Bias modules, tables, relations, GraphQL fields, queries, UI, and docs are gone. The migration drops `decisionBiases` and `decisionFeedback`. Decision execution stores the raw answer and never applies a bias. |
| 2 — Remove end-to-end flow creation | **Complete** | Planner/proposer/draft/confirm/run-review/gate services and their mutations are deleted. `autoPlanned`, `flowGoal`, `runReview`, and `nextStepApproved` are dropped; `flowAutoImprovement` is now `autoImprovement`. Landing requires an explicit task, and the task-builder assistant runs the current draft instead of creating a flow. Structured generation is implemented directly in the assisted application services rather than as a shared primitive. |
| 3 — Runs, attempts, checkpoints, traces | **Complete (with one deviation)** | `runs`, `stepAttempts`, and `traceEvents` exist; `tasks.isDraft`/`draftOwnerId` hide drafts from other users. Standard and assisted submissions both create run rows, and the migration backfills runs for pre-existing queued chains. The assisted read model, ownership checks, snapshot storage, and trace replay query are in place. **Deviation:** standard runs do not persist a task snapshot; only assisted attempts do. Execution is shared, but the "snapshot for every run" part of §6.4 is not implemented. |
| 4 — Trial workspace and effect journal | **Complete (with caveats)** | Trial setup, scoped Drizzle commit, file manifest/commit, discard, and orphan cleanup live in `@repo/trial-workspace`. Each attempt clones `todos` and `fileEntries` plus a read-only baseline schema and copies the files tree to `.trials/<run>/<attempt>/`. Commit compares trial vs baseline and applies only changed rows/files with conflict detection; discard drops both schemas and the directory. Tools declare `trialSafe?: false` when an effect cannot be rolled back, and assisted runs reject those tools. Cleanup runs at backend startup and via `pnpm --filter backend trials:cleanup`. Not implemented: a true idempotent effect journal (commit is still a scoped diff), trial content preview in the UI, workspace/repository ports in tools, and deferred embeddings. |
| 5 — Assisted execution and tool-step review | **Complete** | Tool steps execute inside a trial, then park at `awaiting_step_review`. Accept commits effects and finishes the step; reject/revision re-runs from the checkpoint; cancel discards. Assisted steps are excluded from the standard queue views and forced to run alone, including foreach children, even when their task allows parallelism. Standard runs still auto-commit and keep parallel/priority behaviour. Tools can declare `trialSafe: false`, and assisted runs fail them before creating a trial. |
| 6 — Step revision engine | **Complete (manual verification)** | `updateToolConfig`, `replaceTask`, `runNext`, `insertBefore`, `insertAfter`, and `insertBeforeAndAfter` are implemented and validated by `smoke:assisted-revision`. Validation enforces proposal shape, required fields, confidence range, exactly two insertions for `insertBeforeAndAfter`, tool existence/input-schema/foreach support, target existence, cycle rejection, and `MAX_CHAIN_DEPTH`. `replaceTask` now builds functional tool, decision, and user-decision snapshots (negative ids are promoted on accept). Revision coverage is a smoke script, not an automated Vitest integration suite. |
| 7 — Decision review and optimization | **Complete** | Decision attempts record normalized confidence and the matched result. Review supports accept, explicit override, wording optimization (capped at 3 attempts), manual wording editing, and new-option creation. Matches below 0.8 or with no match are parked, and `acceptAttempt` rejects them until the user overrides; decision revisions resolved by override persist their snapshot. Choice options are never renamed by the optimizer, and nothing in the optimizer path can lower a threshold. New options and overrides route through the target-wiring review (`wireDecisionTargetTask`/`createDecisionTargetTask`). Verified end-to-end with `smoke:assisted-decision` using `tev1:4b`. |
| 8 — User-decision editing and cancellation | **Complete (with caveats)** | `saveUserDecisionOptions` additively updates or inserts static labels/descriptions/values/targets without deleting dynamic or yes/no rows; answering resumes or completes the assisted run and commits its attempt. Cancel discards the current trial and uncommitted attempts, repairs inserted-chain edges, deletes only run-owned draft tasks, and leaves definitions at their last accepted state. Hard delete removes steps, attempts, traces, draft tasks, and trial directories. Orphan cleanup runs at startup/on demand. Not implemented: a server-side staged option draft (the UI edits locally and saves explicitly) and wording editing for `yesNo` options beyond their configured labels. |
| 9 — Trace capture and streaming | **Complete (with caveats)** | Trace rows persist with per-run sequences, redaction, and truncation; `attemptTrace` and the `assistedTraceEvent` subscription exist. The trace accordion loads history and appends live events from the run subscription, and run/review queries no longer poll. Not implemented: a separate `packages/observability`, token-stream/duration instrumentation in `@repo/ai`, and prompt-token capture. |
| 10 — UI rebuild | **Complete (with caveats)** | Landing composer, run list, run timeline, review panels, trace accordion, and the task-builder assistant are rebuilt around assisted runs. The old flow UI is gone. `components/assisted` is split into atoms/molecules/organisms/templates plus hooks/domain, data access is in hooks, semantic confidence/diff tokens replace generic variants, review actions emit events only, and the history view browses finished runs. Not implemented: RTL component/hook tests and a full reduced-motion audit. |
| 11 — Hardening and docs | **Complete (with caveats)** | `pnpm check-types`, `pnpm lint` (including `apps/backend`), `pnpm test`, `pnpm build`, and `pnpm codegen` pass. README documents assisted runs, sandbox/commit, 0.8 review, traces, retention, and no-version-history behaviour. Four smoke scripts cover the workspace, the tool-step lifecycle, revisions, and decision review. Not done: automated failure/idempotency and disk-usage checks, DB/RTL integration suites, and a full golden-scenario run with real models. |

### Verification commands

```bash
pnpm check-types
pnpm lint
pnpm test
pnpm build
pnpm codegen

pnpm --filter backend smoke:assisted-workspace
pnpm --filter backend smoke:assisted-run
pnpm --filter backend smoke:assisted-revision
pnpm --filter backend smoke:assisted-decision
```

The smoke scripts mutate the development database, clean up their own tasks
(except retained run history), and must be run against a disposable or
development database. `smoke:assisted-decision` needs Ollama with a decision
model; override `SMOKE_DECISION_MODEL` to change the default `tev1:4b`. It also
covers the unwired-option target review, including drafting a next tool task,
creating it, persisting the wiring, and continuing the run.

### Migration notes

`apps/backend/drizzle/20261123123317_deep_havok/migration.sql` was rewritten
for the branch and applied to the development database. It creates the run,
attempt, and trace tables, drops the flow/bias columns and tables, renames
`flowAutoImprovement`, and backfills standard runs for pre-existing queued
chains. It is a forward migration for the development database, not a
maintainable upgrade path for a released schema.

### Post-implementation fixes

Three defects found while exercising real tasks were fixed after the first
implementation pass:

- Choice decisions no longer require `optionDescriptions` at execution time.
  Decisions created before descriptions were mandatory (or imported without
  them) now run with empty criteria instead of failing with
  `decision setup error: missing optionDescriptions for choice`.
- The scheduler no longer spins forever on a `queued` step whose task was
  deleted. Such a step is marked failed, and an assisted run with no remaining
  work is marked failed instead of staying `running`.
- `setRunStatus` no longer overwrites a terminal (`completed`, `cancelled`,
  `failed`) run. This closes a race where an in-flight attempt finishing after
  cancellation made the cancelled run look active again.

- The decision optimizer no longer lets the model rename or add choice options.
  Choice results are matched by exact option string, so an optimized option such
  as "It relates to files (...creating, or updating...)" previously produced a
  selectable choice with no result wiring and therefore a false “no match”.
  Optimization now preserves the original option list and only adopts new
  descriptions for those exact names.

- A decision task with no attached decision is now rejected before a run is
  created, with an actionable message. The assistant pre-checks the builder
  draft, `startAssistedRun` validates the snapshot, and the queue failure note
  is actionable. Previously the run was created and then failed with the
  internal `decision task has no decisionId`.

- Creating a decision from the task builder now selects it for the task, so
  saving the task stores `decisionId`. Previously the decision was persisted but
  never attached, leaving decision tasks unrunnable.

- Applying a builder snapshot no longer blanks the saved decision's premise,
  instruction, or option descriptions. The builder snapshot only carries
  `{ id, type, options }`, so snapshot application now merges those fields
  against the stored row instead of overwriting missing fields with empty
  values.

- Assisted decision matching now recognizes a result whose option matched but
  has no target task yet. It no longer reports “no match” or hides the chosen
  option. The decision parks on a target review, and the user can wire an
  existing task or have the model draft the next tool task inline. Drafting,
  creating, and wiring are explicit steps, and the run continues only after the
  target is chosen. The wiring is persisted on the decision result so future
  runs take the same branch automatically.
- Overriding a decision to an unwired option now opens the same target review
  instead of failing with “That option has no next task”. Accepting an unwired
  match is blocked with an actionable message. Standard runs keep their previous
  behaviour: unwired results are not considered matches and the fallback path is
  unchanged. The review is backed by `draftDecisionTargetTask`,
  `wireDecisionTargetTask`, and `createDecisionTargetTask`; the inline panel lets
  the user refine the drafted task/config, choose an existing task, and continue.
- Trace recording no longer fails if the attempt is deleted while a model call
  is still in flight (for example, the user cancels the run while the next-task
  draft is generating). The event is stored on the run without the attempt id
  instead of surfacing a `traceEvents_attemptId_stepAttempts_id_fkey` error.
- `create_file` now appends `.md` when the requested name has no usable
  extension. Previously an extensionless name such as `ALPH` was classified as
  `other` and rejected, so a branch that asked for “a file called ALPH” could
  never complete. Explicit extensions are unchanged, and non-plaintext types are
  still rejected.

- Decision premises are constrained to one or two words. Decision creation,
  updates, replacement drafts, manual wording edits, and the optimizer all
  enforce the limit; the optimizer prompt asks for a short key and falls back to
  the current valid premise (or derives one word) if the model returns a
  sentence.

The decision review panel also no longer continues immediately when an option
is clicked. Selecting an option is now a separate step, so "use this choice for
this run" and "optimize wording" remain visible and usable before the run
continues. Revision attempts now render a **What changed** block that compares
the previous and current decision snapshots: premise, instruction, changed
option descriptions, and added/removed options, plus the optimizer feedback.

### Remaining follow-ups

1. Add DB integration tests, RTL component/hook tests, and a fake model adapter.
2. Add automated failure/idempotency and disk-usage checks for trials.
3. Add a true effect journal if partial-commit replay is needed; the current
   commit is a scoped diff with conflict detection.
4. Add trial content preview and deferred embedding generation.
5. Run a full golden scenario with real models and a disposable database.
