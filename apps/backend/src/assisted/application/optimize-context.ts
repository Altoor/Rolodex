import { GraphQLError } from "graphql";
import { db } from "@repo/db";
import { getRun } from "../../queue/run-store";
import { getAttempt, isLatestAttempt, type TaskSnapshot } from "../attempts";

/** Loads and authorises the attempt a decision review action targets. */
export async function loadReviewContext(userId: number, attemptId: number) {
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

  return {
    attempt,
    run,
    step,
    snapshot: attempt.taskSnapshot as unknown as TaskSnapshot,
  };
}
