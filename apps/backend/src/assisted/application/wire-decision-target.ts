import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db, stepAttempts, tasks } from "@repo/db";
import { completeReviewedStep, enqueueSteps } from "../../queue/step-store";
import { setRunStatus } from "../../queue/run-store";
import {
  assertValidTaskConfig,
  defaultCanRunInParallel,
} from "../../schema/task/task/task-service";
import { persistSnapshot, type TaskSnapshot } from "../attempts";
import { NextTaskDraftError, parseNextTaskDraft, type NextTaskDraft } from "../domain/next-task";
import { recordTrace } from "../infrastructure/trace";
import { loadDecisionTargetContext } from "./target-context";

async function createToolTask(
  userId: number,
  draft: NextTaskDraft,
): Promise<number> {
  await assertValidTaskConfig({
    type: "tool",
    toolKey: draft.toolKey,
    toolConfig: draft.toolConfig,
    toolOutputType: draft.toolOutputType,
    model: null,
    decisionModel: null,
  });

  const [task] = await db
    .insert(tasks)
    .values({
      name: draft.name,
      type: "tool",
      toolKey: draft.toolKey,
      toolConfig: draft.toolConfig,
      toolOutputType: draft.toolOutputType,
      canRunInParallel: defaultCanRunInParallel("tool", draft.toolKey),
      isDraft: true,
      draftOwnerId: userId,
    })
    .returning();

  if (!task) {
    throw new GraphQLError("Could not create the next task", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }
  return task.id;
}

async function wireTarget(
  userId: number,
  attemptId: number,
  resultId: number,
  target: { taskId: number } | { draft: NextTaskDraft },
): Promise<string> {
  const context = await loadDecisionTargetContext(userId, attemptId);

  if (context.resultId !== resultId) {
    throw new GraphQLError(
      "This is not the decision option waiting for a next task",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  let createdTaskId: number | null = null;
  let targetTaskId: number;
  let targetName: string;

  if ("draft" in target) {
    createdTaskId = await createToolTask(userId, target.draft);
    targetTaskId = createdTaskId;
    targetName = target.draft.name;
  } else {
    const row = await db.query.tasks.findFirst({
      where: { id: target.taskId },
    });
    if (!row) {
      throw new GraphQLError("Target task not found", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    if (row.type === "decision" && row.decisionId == null) {
      throw new GraphQLError(
        `Task "${row.name}" is a decision task with no decision attached. Choose another task or create a new one.`,
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
    if (row.type === "tool" && !row.toolKey) {
      throw new GraphQLError(
        `Task "${row.name}" is a tool task with no tool selected. Choose another task or create a new one.`,
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
    if (row.type === "textPrompt") {
      throw new GraphQLError(
        `Task "${row.name}" is a text-prompt task, which assisted runs cannot execute yet. Choose another task or create a new one.`,
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
    targetTaskId = row.id;
    targetName = row.name;
  }

  // Persist the wiring on the snapshot so accepting/future runs can take the
  // same branch without asking again.
  const updatedSnapshot: TaskSnapshot = {
    ...context.snapshot,
    results: context.snapshot.results.map((row) =>
      row.id === context.resultId ? { ...row, resultTaskId: targetTaskId } : row,
    ),
  };

  const base =
    typeof context.attempt.result === "object" &&
    context.attempt.result !== null
      ? (context.attempt.result as Record<string, unknown>)
      : {};
  const rest = { ...base };
  delete rest.unwiredResultId;
  delete rest.unwiredOption;
  delete rest.unwiredOptionDescription;
  delete rest.note;

  const summary = `Wired "${context.label}" to "${targetName}"`;
  const updatedResult = {
    ...rest,
    matchedResultId: context.resultId,
    nextTaskId: targetTaskId,
    branch: "result",
    summary,
  };

  const nextToolState = context.result.appendState
    ? [
        ...context.step.toolState,
        { decision: base.effectiveAnswer ?? context.result.option },
      ]
    : context.step.toolState;

  await db
    .update(stepAttempts)
    .set({
      status: "committed",
      committedAt: new Date(),
      review: {
        accepted: true,
        wiredResultId: context.resultId,
        targetTaskId,
        reviewedAt: new Date().toISOString(),
        reviewedBy: userId,
      },
      taskSnapshot: updatedSnapshot as unknown as Record<string, unknown>,
      result: updatedResult,
    })
    .where(eq(stepAttempts.id, context.attempt.id));

  await persistSnapshot(updatedSnapshot, userId);

  if (createdTaskId != null) {
    await db
      .update(tasks)
      .set({ isDraft: false, draftOwnerId: null })
      .where(eq(tasks.id, createdTaskId));
  }

  await completeReviewedStep(context.step.id, updatedResult, summary);

  const ids = await enqueueSteps([
    {
      taskId: targetTaskId,
      state: context.step.state,
      toolState: nextToolState,
      depth: context.step.depth + 1,
      parentQueuedTaskId: context.step.id,
      runId: context.step.runId,
      queued_by: context.step.queued_by,
      model: context.step.model,
      decisionModel: context.step.decisionModel,
    },
  ]);

  await recordTrace({
    runId: context.run.id,
    attemptId: context.attempt.id,
    kind: "decision.target.wired",
    payload: {
      resultId: context.resultId,
      option: context.label,
      targetTaskId,
      created: createdTaskId != null,
    },
  });

  if (ids.length > 0) {
    await setRunStatus(context.run.id, "running");
    const { triggerQueue } = await import("../../queue/processor");
    triggerQueue();
  }

  return context.run.id;
}

/** Continues the run using an existing task as the decision branch target. */
export async function wireDecisionTargetTask(
  userId: number,
  attemptId: number,
  resultId: number,
  targetTaskId: number,
): Promise<string> {
  return wireTarget(userId, attemptId, resultId, { taskId: targetTaskId });
}

/** Creates the drafted tool task, wires it, and continues the run. */
export async function createDecisionTargetTask(
  userId: number,
  attemptId: number,
  resultId: number,
  rawDraft: unknown,
): Promise<string> {
  let draft: NextTaskDraft;
  try {
    draft = parseNextTaskDraft(rawDraft);
  } catch (err) {
    if (err instanceof NextTaskDraftError) {
      throw new GraphQLError(err.message, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    throw err;
  }

  return wireTarget(userId, attemptId, resultId, { draft });
}
