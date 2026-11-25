# PR #8 fix plan

Source: local review of `feature/api` vs `origin/main`. Checked items are implemented in the working tree. Notes call out anything that needs a live database to test.

## Must fix — authorization (IDOR)

- [x] Add a single task-visibility helper (`visibleTaskCondition`, `loadVisibleTask`, `assertTaskVisible`, `assertTasksVisible`, `visibleTaskIds`).
- [x] Enforce visibility in `getTask`.
- [x] Enforce visibility in `exportTasksFile` (no ids + explicit ids).
- [x] Enforce visibility in `createQueuedTask` (and default task).
- [x] Enforce visibility in `createApiEndpoint` / `updateApiEndpoint` via `TaskNotVisibleError`.
- [x] Enforce visibility in `updateTask` / `deleteTask`.
- [x] Enforce visibility in `wireDecisionTargetTask` / target lookup.
- [x] Enforce visibility in `importTasksFile(reuseExisting)`.
- [x] Enforce ownership in `completeQueuedTask` / `deleteQueuedTask` / `deleteCompletedQueuedTasksBefore`.
- [x] Scope `queuedTask(runId)` query to the caller's runs.

## Must fix — child-row writes

- [x] Scope `syncSnapshotChildren` UPDATEs by `taskId`; treat foreign ids as inserts.
- [x] Scope `persistSnapshot` result/option UPDATEs by `taskId`; foreign ids become inserts.
- [x] Validate/normalize snapshot before persisting (visibility, graph cycles, decision ownership).
- [x] Guard `persistSnapshot` against rewriting a decision owned by another author (copy instead).

## Must fix — accept / revision concurrency

- [x] Make accept a conditional state transition (`awaiting_input` → `running` claim) and enqueue only when won.
- [x] Reorder `acceptAttempt`: commit workspace, mark committed, persist, then complete step.
- [x] Make `markAttemptCommitted` conditional on status and return whether it won.
- [x] Replace racy `completeReviewedStep` with `claimReviewedStep` / `releaseReviewedStepClaim`; removed the old helper.
- [x] Make `applyStepRevision` reject stale/concurrent reviews with a conditional step claim.
- [x] Commit the workspace before rewiring the live graph in `applyStepRevision`.
- [x] Ensure discarded/conflicted revisions clean up inserted draft tasks and restore live edges.

## Must fix — trial workspace

- [x] Fail closed on writes to tables outside `TRIAL_TABLES` in trial scope (including transactions).
- [x] Document non-atomic DB+file commit and retry safety in `manager.ts`.
- [x] Document the accepted O(workspace) copy cost in `manager.ts` / `schema.ts`.
- [x] Keep `search_path` isolation explicit and explain why the allowlist backs it up.

## Must fix — API hardening

- [x] Require the dedicated standard key for `/api/v1` (endpoint keys cannot read account resources).
- [x] Add a total 50 MiB multipart request byte cap.
- [x] Stop accepting `?key=` outside WebSocket upgrades.
- [x] Add CORS allowlist support (`API_CORS_ORIGINS`, safe same-origin default).
- [x] Derive public origin from `API_PUBLIC_ORIGIN` instead of trusting `Host`.
- [x] Validate UUID params (`requestId`, endpoint ids) and return 404 instead of 500.
- [x] Compensate/clean up when the invoke run is queued but `apiRequests` insert fails (`runtime.cancelFlow`).
- [x] Document the lack of rate limiting / idempotency as an explicit follow-up.

## Must fix — migrations

- [x] Remove dead DDL churn (`decisionBiases`, `decisionFeedback`, `nextStepApproved`, `flowAutoImprovement`) from the migration chain.
- [x] Replace `DROP COLUMN IF EXISTS` guarded drops with a documented consistent approach (only legacy, never-created columns stay guarded).

## File size / SOLID splits

- [x] Split `task-transfer-service.ts` into export/import/parse/types modules with a re-export facade.
- [x] Extract static tables from `packages/ui/src/lib/toolStatePaths.ts` into `toolStateDerivation.ts`; catalog/record helpers now live in `toolStateFields.ts`.
- [x] Split `use-assisted-run.ts` (was 460 lines) into documents, `use-assisted-run-actions.ts`, `use-assisted-run-starter.ts`, `use-attempt-trace.ts`, and `use-decision-target-actions.ts`.
- [x] Split `apply-revision.ts` by proposal family (`revision-support.ts`, `apply-insertion-revision.ts`); all files < 300 lines.
- [x] Split `assisted.ts` into `assisted-access.ts`, `assisted-queries.ts`, `assisted-mutations.ts`, and `assisted-subscriptions.ts`; `assisted.ts` is now a facade.
- [x] Split `start-run.ts` into snapshot/orchestration modules (`start-run-snapshot.ts`, `snapshot-children.ts`, `snapshot-record.ts`).
- [x] Split `attempts.ts` into attempt lifecycle and `persist-snapshot.ts`.
- [x] Split `accept-attempt.ts` into accept / override modules.
- [x] Extract prompt-building from `optimize-decision.ts` into `optimize-prompt.ts`; wording/option actions now live in `decision-wording.ts` / `decision-option.ts` with shared `optimize-context.ts`.
- [x] Split `task-service.ts` config validation into `task-config.ts`.
- [x] Split `queued-task-service.ts` dismiss/retry into `queued-task-actions.ts`.
- [x] Split `step-review-panel.tsx` decision/tool subflows into molecules.
- [x] Split `decision-target-wiring.tsx` into picker + draft form + container.
- [x] Extract per-type handlers from `queue/assisted-step.ts` into `queue/assisted/`.
- [x] Split `api-endpoint-card.tsx` into presentational card + form + curl example + container.
- [ ] Split smoke-script fixtures/helpers (lower priority, not needed for correctness).

### Remaining >300-line files: assessment

- `packages/trial-workspace/src/manager.ts` (303) — one cohesive commit/copy lifecycle with inline docs; splitting would scatter the non-atomic commit contract. Kept intact.
- `packages/ui/src/components/assisted/molecules/decision-review.tsx` and similar molecules (247) are now under the limit after extraction.
- `README.md` is documentation, not code.
- Every other touched `.ts`/`.tsx` file is now under 300 lines.

## Atomic design

- [x] Move assisted data-fetching containers out of templates/organisms/molecules (`containers/`).
- [x] Reorganize `components/api/` into atoms/molecules/organisms/containers/lib.
- [x] Keep all new components presentational (props in, callbacks out).
- [x] Use existing primitives and design tokens instead of raw values.

## Tests

- [x] Task visibility helper tests (draft owner vs shared task).
- [ ] `persistSnapshot` / `syncSnapshotChildren` scoping tests — needs a live Postgres; the code paths are scoped but not integration-tested here.
- [x] Conditional `markAttemptCommitted` idempotency test (full concurrent DB race needs a live database).
- [x] Trial workspace fail-closed test (`assertTableWritable`); commit-conflict remains covered by the shared `TrialCommitConflictError` path but needs a live database.
- [x] Task transfer parse/remap tests (draft filtering is query-scoped but needs a live database to exercise).
- [x] API tests: UUID validation, query-key gating, CORS/public-origin, multipart total cap (standard-only auth is enforced in code; a DB-backed auth test would need a database).

## Smaller notes

- [x] Mark in-flight attempts failed/superseded during `resetRunningSteps`.
- [x] Keep `plan.md` at the repo root as the live checklist (explicit user requirement).
- [x] Document `apiRequests` retention policy and rate-limiting/idempotency follow-ups.

## Verification

- [x] `pnpm test` passes (138 tests).
- [x] `pnpm check-types` passes (11 packages).
- [x] `pnpm lint` passes for the touched packages; `API_PUBLIC_ORIGIN` / `API_CORS_ORIGINS` are registered in `turbo.json`.
- [x] Final review of the diff for scope and regressions.
