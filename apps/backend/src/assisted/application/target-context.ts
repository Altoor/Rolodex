import { GraphQLError } from "graphql";
import { db } from "@repo/db";
import {
  getAttempt,
  isLatestAttempt,
  type AttemptRow,
  type TaskSnapshot,
} from "../attempts";
import { getRun } from "../../queue/run-store";
import { decisionResultLabel } from "../../queue/user-choice";
import type { QueuedRow } from "../../queue/types";

type RunRow = typeof import("@repo/db").runs.$inferSelect;
type ResultRow = TaskSnapshot["results"][number];

export interface DecisionTargetContext {
  attempt: AttemptRow;
  run: RunRow;
  step: QueuedRow;
  snapshot: TaskSnapshot;
  result: ResultRow;
  resultId: number;
  label: string;
  description: string | null;
}

export function decisionOptionDescription(
  snapshot: TaskSnapshot,
  result: ResultRow,
): string | null {
  const options = snapshot.decision?.options ?? [];
  const index = result.option != null ? options.indexOf(result.option) : -1;
  if (index < 0) return null;
  return snapshot.decision?.optionDescriptions?.[index] ?? null;
}

/**
 * Loads the attempt/step/result that is waiting for a next-task target. Shared
 * by the drafting and wiring flows so they validate the same state.
 */
export async function loadDecisionTargetContext(
  userId: number,
  attemptId: number,
): Promise<DecisionTargetContext> {
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
      "A newer attempt replaced this one. Review the latest attempt instead.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const result = attempt.result;
  const resultId =
    typeof result === "object" &&
    result !== null &&
    typeof (result as { unwiredResultId?: unknown }).unwiredResultId ===
      "number"
      ? (result as { unwiredResultId: number }).unwiredResultId
      : null;

  if (resultId == null) {
    throw new GraphQLError("This decision is not waiting for a next task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const snapshot = attempt.taskSnapshot as unknown as TaskSnapshot;
  const match = snapshot.results.find((row) => row.id === resultId);
  if (!match) {
    throw new GraphQLError("Decision result not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (match.resultTaskId != null) {
    throw new GraphQLError("This decision result already has a target task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const index = snapshot.results.indexOf(match);
  const type = snapshot.decision?.type ?? match.type;

  return {
    attempt,
    run,
    step,
    snapshot,
    result: match,
    resultId,
    label: match.option ?? decisionResultLabel(match, index, type),
    description: decisionOptionDescription(snapshot, match),
  };
}
