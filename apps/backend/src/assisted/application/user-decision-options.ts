import { GraphQLError } from "graphql";
import { and, eq } from "drizzle-orm";
import { db, queuedTasks, stepAttempts, userDecisionOptions } from "@repo/db";
import { getRun } from "../../queue/run-store";
import { buildUserDecisionPendingChoice } from "../../queue/processors/user-decision-step";
import {
  getAttempt,
  isLatestAttempt,
  type TaskSnapshot,
} from "../attempts";
import { recordTrace } from "../infrastructure/trace";
import { assertTasksVisible } from "../../schema/task/task/task-visibility";

export interface UserDecisionOptionEdit {
  id?: number | null;
  label?: string | null;
  description?: string | null;
  value?: string | null;
  resultTaskId?: number | null;
  appendState?: boolean;
  sortOrder?: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Edits the options shown for a parked user-decision step. There is no model
 * review here: the user may only adjust wording/values, then choose.
 */
export async function saveUserDecisionOptions(
  userId: number,
  attemptId: number,
  rawOptions: unknown,
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
    throw new GraphQLError("This step is not waiting for a choice", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (!(await isLatestAttempt(attempt))) {
    throw new GraphQLError(
      "A newer attempt replaced this one. Review the latest attempt instead.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const pending = step.pendingChoice as { kind?: string } | null;
  if (pending?.kind !== "userDecision") {
    throw new GraphQLError("This step is not a user decision", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const rows = (Array.isArray(rawOptions) ? rawOptions : []) as Record<
    string,
    unknown
  >[];

  await assertTasksVisible(
    userId,
    rows.map((row) =>
      typeof row.resultTaskId === "number" ? row.resultTaskId : null,
    ),
  );

  // Edits are additive/updating only. Dynamic selectors and yes/no rows are
  // part of the task definition and must never be deleted by a wording save.
  for (const row of rows) {
    const id = typeof row.id === "number" ? row.id : null;

    if (id != null && id > 0) {
      const [existing] = await db
        .select()
        .from(userDecisionOptions)
        .where(
          and(
            eq(userDecisionOptions.id, id),
            eq(userDecisionOptions.taskId, step.taskId),
          ),
        )
        .limit(1);
      if (!existing) continue;

      await db
        .update(userDecisionOptions)
        .set({
          label: asString(row.label) ?? existing.label,
          description: asString(row.description) ?? existing.description,
          value: asString(row.value) ?? existing.value,
          resultTaskId:
            typeof row.resultTaskId === "number"
              ? row.resultTaskId
              : existing.resultTaskId,
          appendState:
            typeof row.appendState === "boolean"
              ? row.appendState
              : existing.appendState,
          sortOrder:
            typeof row.sortOrder === "number"
              ? row.sortOrder
              : existing.sortOrder,
        })
        .where(eq(userDecisionOptions.id, id));
      continue;
    }

    const kind = asString(row.kind);
    await db.insert(userDecisionOptions).values({
      taskId: step.taskId,
      kind: kind === "dynamic" ? "dynamic" : "static",
      label: asString(row.label),
      description: asString(row.description),
      value: asString(row.value),
      selector:
        row.selector && typeof row.selector === "object"
          ? row.selector
          : null,
      labelPath: asString(row.labelPath),
      descriptionPath: asString(row.descriptionPath),
      valuePath: asString(row.valuePath),
      resultTaskId:
        typeof row.resultTaskId === "number" ? row.resultTaskId : null,
      appendState:
        typeof row.appendState === "boolean" ? row.appendState : false,
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
    });
  }

  const persisted = await db.query.userDecisionOptions.findMany({
    where: { taskId: step.taskId },
  });
  persisted.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const snapshot = attempt.taskSnapshot as unknown as TaskSnapshot;
  const nextSnapshot: TaskSnapshot = {
    ...snapshot,
    userDecisionOptions: persisted,
  };
  await db
    .update(stepAttempts)
    .set({ taskSnapshot: nextSnapshot as unknown as Record<string, unknown> })
    .where(eq(stepAttempts.id, attempt.id));

  const pendingChoice = await buildUserDecisionPendingChoice(
    snapshot.task,
    step.toolState,
  );
  if (!pendingChoice) {
    throw new GraphQLError("A user decision needs at least one option", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await db
    .update(queuedTasks)
    .set({ pendingChoice })
    .where(eq(queuedTasks.id, step.id));

  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "userDecision.optionsEdited",
    payload: { optionCount: persisted.length },
  });

  return run.id;
}
