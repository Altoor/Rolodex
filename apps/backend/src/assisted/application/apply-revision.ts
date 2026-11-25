import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db, stepAttempts, tasks } from "@repo/db";
import {
  getToolDefinition,
  validateToolConfig,
  ToolConfigValidationError,
} from "@repo/tools";
import type { TaskRow } from "../../queue/types";
import { inheritedForkFields } from "../../queue/joins";
import { completeRunIfIdle, getRun, setRunStatus } from "../../queue/run-store";
import {
  completeReviewedStep,
  enqueueSteps,
  resumeReviewedStep,
} from "../../queue/step-store";
import { runAssistedAttempt } from "../../queue/assisted-step";
import {
  getAttempt,
  isLatestAttempt,
  markAttemptCommitted,
  supersedeAttempt,
  taskFromSnapshot,
  type TaskSnapshot,
} from "../attempts";
import {
  validateRevisionProposal,
  type RevisionProposal,
  type TaskDraft,
} from "../domain/revision";
import { commitTrial, discardTrial, resumeTrial } from "../infrastructure/workspace";
import { recordTrace } from "../infrastructure/trace";
import {
  assertRevisionFits,
  inspectGraph,
  RevisionGraphError,
} from "./graph-safety";

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT" },
  });
}

function validateToolDraft(draft: TaskDraft): void {
  if (draft.type !== "tool") return;

  const definition = draft.toolKey
    ? getToolDefinition(draft.toolKey)
    : undefined;
  if (!definition) {
    throw badInput(`Unknown tool "${draft.toolKey ?? ""}"`);
  }

  try {
    validateToolConfig(definition, draft.toolConfig);
  } catch (err) {
    if (err instanceof ToolConfigValidationError) {
      throw badInput(err.message);
    }
    throw err;
  }

  if (
    draft.toolOutputType === "foreach" &&
    !(definition.outputTypes ?? ["normal"]).includes("foreach")
  ) {
    throw badInput(`"${definition.key}" does not support foreach output`);
  }
}

function validateToolConfigFor(
  toolKey: string | null,
  config: Record<string, unknown> | null | undefined,
): void {
  const definition = toolKey ? getToolDefinition(toolKey) : undefined;
  if (!definition) {
    throw badInput(`Unknown tool "${toolKey ?? ""}"`);
  }
  try {
    validateToolConfig(definition, config);
  } catch (err) {
    if (err instanceof ToolConfigValidationError) {
      throw badInput(err.message);
    }
    throw err;
  }
}

/** Explicit targets a draft would wire, used for cycle/depth checks. */
function draftTargets(draft: TaskDraft, includeFallback = true): number[] {
  const targets = [
    includeFallback ? draft.fallbackTaskId : null,
    draft.onTrueTaskId,
    draft.onFalseTaskId,
    ...(draft.decision?.results ?? []).map((result) => result.resultTaskId),
    ...(draft.userDecisionOptions ?? []).map((option) => option.resultTaskId),
  ].filter((value): value is number => typeof value === "number");
  return [...new Set(targets)];
}

function numericOption(option: string): number | null {
  const value = Number(option);
  return Number.isFinite(value) ? value : null;
}

function buildReplacementSnapshot(
  snapshot: TaskSnapshot,
  draft: TaskDraft,
): TaskSnapshot {
  const task: TaskRow = {
    ...snapshot.task,
    name: draft.name,
    type: draft.type,
    decisionId: null,
    toolKey: draft.toolKey ?? null,
    toolConfig: draft.toolConfig ?? null,
    toolOutputType: draft.toolOutputType ?? "normal",
    fallbackTaskId: draft.fallbackTaskId ?? null,
    onTrueTaskId: draft.onTrueTaskId ?? null,
    onFalseTaskId: draft.onFalseTaskId ?? null,
    model: draft.model ?? null,
    decisionModel: draft.decisionModel ?? null,
    userDecisionType: draft.userDecisionType ?? "list",
    userDecisionConfig: draft.userDecisionConfig ?? null,
  };

  if (draft.type === "decision" && draft.decision) {
    const decisionId = -Math.abs(Date.now() + snapshot.task.id);
    task.decisionId = decisionId;
    const decision = draft.decision;
    const results = decision.options.map((option, index) => {
      const explicit = decision.results?.find(
        (result) =>
          (result.option ?? option) === option ||
          result.option === option ||
          result.scoreThreshold === Number(option) ||
          result.probabilityThreshold === Number(option),
      );
      return {
        id: -(index + 1),
        taskId: snapshot.task.id,
        type: decision.type,
        option: decision.type === "choice" ? option : null,
        scoreThreshold:
          decision.type === "score"
            ? (explicit?.scoreThreshold ?? numericOption(option))
            : null,
        probabilityThreshold:
          decision.type === "noul"
            ? (explicit?.probabilityThreshold ?? numericOption(option))
            : null,
        confidenceThreshold: explicit?.confidenceThreshold ?? null,
        resultTaskId: explicit?.resultTaskId ?? draft.fallbackTaskId ?? null,
        appendState: explicit?.appendState ?? true,
      };
    });

    return {
      task,
      decision: {
        id: decisionId,
        name: decision.name ?? draft.name,
        type: decision.type,
        decisionPremise: decision.decisionPremise,
        instruction: decision.instruction,
        options: decision.options,
        optionDescriptions:
          decision.optionDescriptions ?? decision.options.map(() => ""),
        authorId: snapshot.decision?.authorId ?? 0,
      },
      results: results as TaskSnapshot["results"],
      userDecisionOptions: [],
    };
  }

  if (draft.type === "userDecision") {
    const options = (draft.userDecisionOptions ?? []).map((option, index) => ({
      id: -(index + 1),
      taskId: snapshot.task.id,
      kind: option.kind ?? "static",
      label: option.label ?? null,
      description: option.description ?? null,
      value: option.value ?? null,
      selector: option.selector ?? null,
      labelPath: option.labelPath ?? null,
      descriptionPath: option.descriptionPath ?? null,
      valuePath: option.valuePath ?? null,
      resultTaskId: option.resultTaskId ?? null,
      appendState: option.appendState ?? false,
      sortOrder: option.sortOrder ?? index,
    }));

    return {
      task,
      decision: null,
      results: [],
      userDecisionOptions: options as TaskSnapshot["userDecisionOptions"],
    };
  }

  return {
    task,
    decision: null,
    results: [],
    userDecisionOptions: [],
  };
}

function snapshotOf(attempt: { taskSnapshot: unknown }): TaskSnapshot {
  return attempt.taskSnapshot as TaskSnapshot;
}

function resultOf(attempt: { result: unknown }): Record<string, unknown> {
  return typeof attempt.result === "object" && attempt.result !== null
    ? (attempt.result as Record<string, unknown>)
    : {};
}

async function insertDraftTasks(
  userId: number,
  drafts: TaskDraft[],
): Promise<TaskRow[]> {
  const created: TaskRow[] = [];

  for (const draft of drafts) {
    const [task] = await db
      .insert(tasks)
      .values({
        name: draft.name,
        type: draft.type,
        toolKey: draft.toolKey ?? null,
        toolConfig: draft.toolConfig ?? null,
        toolOutputType: draft.toolOutputType ?? "normal",
        fallbackTaskId: draft.fallbackTaskId ?? null,
        onTrueTaskId: draft.onTrueTaskId ?? null,
        onFalseTaskId: draft.onFalseTaskId ?? null,
        joinTaskId: draft.joinTaskId ?? null,
        model: draft.model ?? null,
        decisionModel: draft.decisionModel ?? null,
        userDecisionType: draft.userDecisionType ?? "list",
        userDecisionConfig: draft.userDecisionConfig ?? null,
        canRunInParallel: false,
        prioritize: false,
        isDraft: true,
        draftOwnerId: userId,
      })
      .returning();

    if (!task) throw new Error("failed to create revision task");
    created.push(task);
  }

  return created;
}

async function setFallback(taskId: number, fallbackTaskId: number | null) {
  await db
    .update(tasks)
    .set({ fallbackTaskId })
    .where(eq(tasks.id, taskId));
}

async function discardAttemptWorkspace(runId: string, attemptId: number) {
  await discardTrial(await resumeTrial(runId, attemptId)).catch(
    () => undefined,
  );
}

async function commitAttemptWorkspace(
  runId: string,
  attemptId: number,
  workspaceKey: string | null,
) {
  if (!workspaceKey) return;
  await commitTrial(await resumeTrial(runId, attemptId));
}

function oldNextTaskId(
  snapshot: TaskSnapshot,
  result: Record<string, unknown>,
): number | null {
  const fromResult =
    typeof result.nextTaskId === "number" ? result.nextTaskId : null;
  return fromResult ?? snapshot.task.fallbackTaskId ?? null;
}

/**
 * Applies one validated repair proposal. Every branch starts a new attempt
 * from the original checkpoint; nothing from the rejected attempt is reused.
 */
export async function applyStepRevision(
  userId: number,
  attemptId: number,
  rawProposal: unknown,
) {
  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    throw new GraphQLError("Attempt not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const run = await getRun(attempt.runId);
  if (!run || run.userId !== userId || run.mode !== "assisted") {
    throw new GraphQLError("Attempt not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const step = await db.query.queuedTasks.findFirst({
    where: { id: attempt.queuedTaskId },
  });
  if (!step || step.status !== "awaiting_input") {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (!(await isLatestAttempt(attempt))) {
    throw new GraphQLError(
      "A newer attempt replaced this one. Revise the latest attempt instead.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const proposal: RevisionProposal = validateRevisionProposal(rawProposal);
  const snapshot = snapshotOf(attempt);
  const result = resultOf(attempt);

  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "revision.applied",
    payload: proposal as unknown as Record<string, unknown>,
  });

  if (proposal.kind === "updateToolConfig") {
    validateToolConfigFor(
      snapshot.task.toolKey,
      proposal.taskPatch?.toolConfig ?? null,
    );
    const task = {
      ...taskFromSnapshot(snapshot),
      toolConfig: proposal.taskPatch?.toolConfig ?? null,
    };
    // The revised attempt replaces the rejected one; its trial is no longer
    // acceptable and must not linger.
    await discardAttemptWorkspace(run.id, attempt.id);
    await supersedeAttempt(attempt.id, "tool configuration revised");
    const resumed = await resumeReviewedStep(step.id);
    if (!resumed) {
      throw new GraphQLError("This attempt is not waiting for review", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    await runAssistedAttempt(
      resumed,
      { ...snapshot, task },
      { kind: "revision", revision: proposal, cause: "updateToolConfig" },
    );
    return run.id;
  }

  if (proposal.kind === "replaceTask") {
    const replacement = proposal.replacement!;
    validateToolDraft(replacement);

    try {
      await assertRevisionFits({
        stepDepth: step.depth,
        insertionCount: 0,
        currentTaskId: snapshot.task.id,
        currentNextId: null,
        replacement: true,
        replacementRoots: draftTargets(replacement),
      });
    } catch (err) {
      if (err instanceof RevisionGraphError) throw badInput(err.message);
      throw err;
    }

    const replacementSnapshot = buildReplacementSnapshot(snapshot, replacement);
    await discardAttemptWorkspace(run.id, attempt.id);
    await supersedeAttempt(attempt.id, "task replaced");
    const resumed = await resumeReviewedStep(step.id);
    if (!resumed) {
      throw new GraphQLError("This attempt is not waiting for review", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    await runAssistedAttempt(
      resumed,
      replacementSnapshot,
      { kind: "revision", revision: proposal, cause: "replaceTask" },
    );
    return run.id;
  }
  if (proposal.kind === "runNext") {
    const target =
      proposal.nextTaskId ?? oldNextTaskId(snapshot, result) ?? null;
    if (target == null) {
      throw new GraphQLError(
        "This step has no next task. Add or wire a target first.",
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }

    await discardAttemptWorkspace(run.id, attempt.id);
    await db
      .update(stepAttempts)
      .set({
        status: "committed",
        review: {
          accepted: true,
          skipped: true,
          reviewedAt: new Date().toISOString(),
          reviewedBy: userId,
        },
        committedAt: new Date(),
      })
      .where(eq(stepAttempts.id, attempt.id));

    await completeReviewedStep(
      step.id,
      {
        ...result,
        skipped: true,
        branch: "none",
        nextTaskId: null,
        summary: "Step skipped; running the next task",
      },
      "step skipped",
    );

    const ids = await enqueueSteps([
      {
        taskId: target,
        state: step.state,
        toolState: step.toolState,
        depth: step.depth + 1,
        parentQueuedTaskId: step.id,
        runId: step.runId,
        queued_by: step.queued_by,
        model: step.model,
        decisionModel: step.decisionModel,
        ...inheritedForkFields(step),
      },
    ]);
    await setRunStatus(run.id, "running");
    const settled = await completeRunIfIdle(run.id);
    if (ids.length > 0 || !settled) {
      const { triggerQueue } = await import("../../queue/processor");
      triggerQueue();
    }
    return run.id;
  }

  const insertions = proposal.insertions ?? [];
  for (const draft of insertions) {
    if (draft.type !== "tool") {
      throw badInput(
        "Only tool tasks can be inserted. Replace this task if it should become a decision.",
      );
    }
    validateToolDraft(draft);
  }

  const oldNext = oldNextTaskId(snapshot, result);
  const beforeDrafts =
    proposal.kind === "insertBefore"
      ? insertions
      : proposal.kind === "insertBeforeAndAfter"
        ? insertions.slice(0, 1)
        : [];
  const afterDrafts =
    proposal.kind === "insertAfter"
      ? insertions
      : proposal.kind === "insertBeforeAndAfter"
        ? insertions.slice(1)
        : [];

  try {
    await assertRevisionFits({
      stepDepth: step.depth,
      insertionCount: insertions.length,
      currentTaskId: snapshot.task.id,
      currentNextId: oldNext,
      afterRoots: afterDrafts.flatMap((draft) =>
        draftTargets(draft, false),
      ),
    });
    const beforeRoots = beforeDrafts.flatMap((draft) =>
      draftTargets(draft, false),
    );
    if (beforeRoots.length > 0) {
      // Pointing at the current task is expected for an inserted-before draft;
      // this only checks that its other targets exist and stay acyclic.
      await inspectGraph(beforeRoots, new Set());
    }
  } catch (err) {
    if (err instanceof RevisionGraphError) throw badInput(err.message);
    throw err;
  }

  const created = await insertDraftTasks(userId, insertions);

  const beforeTasks =
    proposal.kind === "insertBefore"
      ? created
      : proposal.kind === "insertBeforeAndAfter"
        ? created.slice(0, 1)
        : [];
  const afterTasks =
    proposal.kind === "insertAfter"
      ? created
      : proposal.kind === "insertBeforeAndAfter"
        ? created.slice(1)
        : [];

  if (beforeTasks.length > 0) {
    for (let index = 0; index < beforeTasks.length - 1; index += 1) {
      await setFallback(beforeTasks[index]!.id, beforeTasks[index + 1]!.id);
    }
    await setFallback(
      beforeTasks[beforeTasks.length - 1]!.id,
      snapshot.task.id,
    );
  }

  if (afterTasks.length > 0) {
    for (let index = 0; index < afterTasks.length - 1; index += 1) {
      await setFallback(afterTasks[index]!.id, afterTasks[index + 1]!.id);
    }
    await setFallback(afterTasks[afterTasks.length - 1]!.id, oldNext);
    await setFallback(snapshot.task.id, afterTasks[0]!.id);
  }

  const insertedTaskIds = afterTasks.map((task) => task.id);

  if (proposal.kind === "insertAfter") {
    // The current outcome is accepted, then the inserted chain runs. Remember
    // the previous edge so cancel can repair the live graph if a draft is
    // discarded.
    await commitAttemptWorkspace(run.id, attempt.id, attempt.workspaceKey);
    await markAttemptCommitted(attempt.id);
    await completeReviewedStep(
      step.id,
      {
        ...result,
        accepted: true,
        acceptedAt: new Date().toISOString(),
        insertedChain: {
          previousFallback: oldNext,
          insertedTaskIds,
        },
      },
      "step accepted",
    );
  } else {
    await discardAttemptWorkspace(run.id, attempt.id);
    await db
      .update(stepAttempts)
      .set({
        status: "committed",
        review: {
          accepted: true,
          skipped: true,
          reviewedAt: new Date().toISOString(),
          reviewedBy: userId,
        },
        committedAt: new Date(),
      })
      .where(eq(stepAttempts.id, attempt.id));
    await completeReviewedStep(
      step.id,
      {
        ...result,
        skipped: true,
        branch: "none",
        nextTaskId: null,
        summary: "Step deferred; running inserted tasks first",
        ...(afterTasks.length > 0
          ? {
              insertedChain: {
                previousFallback: oldNext,
                insertedTaskIds,
              },
            }
          : {}),
      },
      "step deferred",
    );
  }

  const firstInsertion = beforeTasks[0] ?? afterTasks[0];
  if (!firstInsertion) return run.id;

  await enqueueSteps([
    {
      taskId: firstInsertion.id,
      state: step.state,
      toolState: step.toolState,
      depth: step.depth + 1,
      parentQueuedTaskId: step.id,
      runId: step.runId,
      queued_by: step.queued_by,
      model: step.model,
      decisionModel: step.decisionModel,
      ...inheritedForkFields(step),
    },
  ]);

  await setRunStatus(run.id, "running");
  const { triggerQueue } = await import("../../queue/processor");
  triggerQueue();
  return run.id;
}

export { tasks };
