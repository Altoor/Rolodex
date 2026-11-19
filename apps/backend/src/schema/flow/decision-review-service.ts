import { eq, inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";
import type { SystemOneAnswer } from "ollama";
import {
  db,
  decisionFeedback,
  decisions,
  queuedTasks,
  taskResults,
  tasks,
} from "@repo/db";
import {
  NOUL_BIAS_KEY,
  SCORE_BIAS_KEY,
  applyBiasDeltasWith,
  planBiasDeltas,
  type BiasDelta,
} from "../../queue/decision-bias";
import { resultMatches } from "../../queue/result-matcher";
import { publish } from "../../queue/step-store";
import { decisionResultLabel } from "../../queue/user-choice";
import type { QueuedRow, TaskResultRow } from "../../queue/types";

export interface DecisionReviewChoice {
  id: number;
  label: string;
  option: string | null;
  type: string;
  targetTaskId: number | null;
  targetTaskName: string | null;
  scoreThreshold: number | null;
  probabilityThreshold: number | null;
  confidenceThreshold: number | null;
  bias: number;
  matched: boolean;
}

export interface DecisionReviewContext {
  queuedTaskId: number;
  taskId: number;
  taskName: string;
  decisionId: number | null;
  decisionName: string | null;
  decisionType: string | null;
  decisionPremise: string | null;
  instruction: string | null;
  model: string | null;
  rawAnswer: unknown;
  effectiveAnswer: unknown;
  matchedResultId: number | null;
  results: DecisionReviewChoice[];
  review: unknown;
  canReview: boolean;
}

export interface DecisionReviewResult {
  queuedTask: QueuedRow;
  review: DecisionReviewContext;
}

interface ReviewData {
  queued: QueuedRow;
  task: typeof tasks.$inferSelect;
  decision: typeof decisions.$inferSelect | null;
  results: TaskResultRow[];
  targetNames: Map<number, string>;
  rawAnswer: unknown;
  effectiveAnswer: unknown;
  matchedResultId: number | null;
  review: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asSystemOneAnswer(value: unknown): SystemOneAnswer | null {
  const record = asRecord(value);
  if (!record) return null;

  if (
    record.type === "choice" &&
    typeof record.choice === "string" &&
    asRecord(record.probabilities) &&
    typeof record.confidence === "number"
  ) {
    return record as unknown as SystemOneAnswer;
  }

  if (
    record.type === "score" &&
    typeof record.score === "number" &&
    typeof record.confidence === "number"
  ) {
    return record as unknown as SystemOneAnswer;
  }

  if (record.type === "noul" && typeof record.noul === "number") {
    return record as unknown as SystemOneAnswer;
  }

  return null;
}

function findMatchedResult(
  results: TaskResultRow[],
  answer: SystemOneAnswer | null,
): TaskResultRow | undefined {
  if (!answer) return undefined;

  return results.find(
    (result) =>
      result.resultTaskId != null &&
      result.type === answer.type &&
      resultMatches(result, answer),
  );
}

async function loadReviewData(
  userId: number,
  queuedTaskId: number,
): Promise<ReviewData> {
  const queued = await db.query.queuedTasks.findFirst({
    where: { id: queuedTaskId },
  });

  if (!queued || queued.queued_by !== userId) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const task = await db.query.tasks.findFirst({
    where: { id: queued.taskId },
  });

  if (!task) {
    throw new GraphQLError("Task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (task.type !== "decision") {
    throw new GraphQLError("This step is not a decision task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const decision =
    task.decisionId != null
      ? ((await db.query.decisions.findFirst({
          where: { id: task.decisionId },
        })) ?? null)
      : null;

  const results = (
    await db.query.taskResults.findMany({ where: { taskId: task.id } })
  ).sort((a, b) => a.id - b.id);

  const targetIds = [
    ...new Set(
      results
        .map((result) => result.resultTaskId)
        .filter((id): id is number => id != null),
    ),
  ];

  const targetNames = new Map<number, string>();
  if (targetIds.length > 0) {
    const targets = await db
      .select({ id: tasks.id, name: tasks.name })
      .from(tasks)
      .where(inArray(tasks.id, targetIds));
    for (const target of targets) targetNames.set(target.id, target.name);
  }

  const previous = asRecord(queued.result) ?? {};
  const rawAnswer = previous.answer ?? null;
  const effectiveAnswer = previous.effectiveAnswer ?? rawAnswer;
  const storedMatchedId = asNumber(previous.matchedResultId);
  const matched =
    storedMatchedId != null
      ? results.find((result) => result.id === storedMatchedId)
      : findMatchedResult(results, asSystemOneAnswer(effectiveAnswer));

  return {
    queued,
    task,
    decision: decision ?? null,
    results,
    targetNames,
    rawAnswer,
    effectiveAnswer,
    matchedResultId: matched?.id ?? null,
    review: previous.review ?? null,
  };
}

function resultBiasKey(
  result: TaskResultRow,
  biases: Map<string, number>,
): number {
  if (result.type === "choice") {
    return result.option ? (biases.get(result.option) ?? 0) : 0;
  }
  if (result.type === "score") return biases.get(SCORE_BIAS_KEY) ?? 0;
  return biases.get(NOUL_BIAS_KEY) ?? 0;
}

export async function getDecisionReviewContext(
  userId: number,
  queuedTaskId: number,
): Promise<DecisionReviewContext> {
  const data = await loadReviewData(userId, queuedTaskId);
  const biases = await db.query.decisionBiases.findMany({
    where: data.decision ? { decisionId: data.decision.id } : { id: -1 },
  });
  const biasMap = new Map(biases.map((row) => [row.option, row.bias]));

  return {
    queuedTaskId: data.queued.id,
    taskId: data.task.id,
    taskName: data.task.name,
    decisionId: data.decision?.id ?? null,
    decisionName: data.decision?.name ?? null,
    decisionType: data.decision?.type ?? null,
    decisionPremise: data.decision?.decisionPremise ?? null,
    instruction: data.decision?.instruction ?? null,
    model: asRecord(data.queued.result)?.model
      ? String(asRecord(data.queued.result)?.model)
      : data.queued.decisionModel,
    rawAnswer: data.rawAnswer,
    effectiveAnswer: data.effectiveAnswer,
    matchedResultId: data.matchedResultId,
    results: data.results.map((result, index) => ({
      id: result.id,
      label: decisionResultLabel(
        result,
        index,
        data.decision?.type ?? result.type,
      ),
      option: result.option,
      type: result.type,
      targetTaskId: result.resultTaskId,
      targetTaskName:
        result.resultTaskId != null
          ? (data.targetNames.get(result.resultTaskId) ?? null)
          : null,
      scoreThreshold: result.scoreThreshold,
      probabilityThreshold: result.probabilityThreshold,
      confidenceThreshold: result.confidenceThreshold,
      bias: resultBiasKey(result, biasMap),
      matched: result.id === data.matchedResultId,
    })),
    review: data.review,
    canReview:
      data.decision != null &&
      data.rawAnswer != null &&
      data.queued.status !== "queued" &&
      data.queued.status !== "running" &&
      data.queued.status !== "awaiting_input",
  };
}

function sameReview(
  existing: typeof decisionFeedback.$inferSelect,
  correct: boolean,
  actualResultId: number | null,
): boolean {
  return (
    existing.correct === correct &&
    (existing.actualResultId ?? null) === (actualResultId ?? null)
  );
}

export async function reviewDecisionStep(
  userId: number,
  queuedTaskId: number,
  correct: boolean,
  actualResultId: number | null,
): Promise<DecisionReviewResult> {
  const data = await loadReviewData(userId, queuedTaskId);

  if (
    data.queued.status === "queued" ||
    data.queued.status === "running" ||
    data.queued.status === "awaiting_input"
  ) {
    throw new GraphQLError("This decision has not finished yet", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (!data.decision || data.rawAnswer == null) {
    throw new GraphQLError("This step has no decision answer to review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const rawAnswer = asSystemOneAnswer(data.rawAnswer);
  const effectiveAnswer = asSystemOneAnswer(data.effectiveAnswer);

  if (!rawAnswer || !effectiveAnswer) {
    throw new GraphQLError("The stored decision answer is not readable", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const actualResult =
    actualResultId != null
      ? data.results.find((result) => result.id === actualResultId)
      : undefined;

  if (!correct && !actualResult) {
    throw new GraphQLError(
      "Choose the result that should have been selected",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const predictedResult =
    data.results.find((result) => result.id === data.matchedResultId) ?? null;

  const deltas: BiasDelta[] = correct
    ? []
    : planBiasDeltas(
        rawAnswer,
        effectiveAnswer,
        predictedResult,
        actualResult!,
      );

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(decisionFeedback)
      .where(eq(decisionFeedback.queuedTaskId, queuedTaskId))
      .limit(1);

    if (existing && sameReview(existing, correct, actualResultId ?? null)) {
      const [sameRow] = await tx
        .select()
        .from(queuedTasks)
        .where(eq(queuedTasks.id, queuedTaskId))
        .limit(1);
      return sameRow;
    }

    if (existing) {
      const reversal = (existing.appliedDeltas ?? []).map((entry) => ({
        key: entry.key,
        delta: -entry.delta,
      }));
      await applyBiasDeltasWith(tx, data.decision!.id, reversal);
    }

    if (deltas.length > 0) {
      await applyBiasDeltasWith(tx, data.decision!.id, deltas);
    }

    const now = new Date();
    await tx
      .insert(decisionFeedback)
      .values({
        queuedTaskId,
        taskId: data.task.id,
        decisionId: data.decision!.id,
        runId: data.queued.runId,
        predictedResultId: data.matchedResultId,
        actualResultId: actualResultId ?? null,
        correct,
        appliedDeltas: deltas,
        reviewedBy: userId,
      })
      .onConflictDoUpdate({
        target: decisionFeedback.queuedTaskId,
        set: {
          predictedResultId: data.matchedResultId,
          actualResultId: actualResultId ?? null,
          correct,
          appliedDeltas: deltas,
          reviewedBy: userId,
          updatedAt: now,
        },
      });

    const previousResult = asRecord(data.queued.result) ?? {};
    const review = {
      status: correct ? "correct" : "wrong",
      predictedResultId: data.matchedResultId,
      actualResultId: actualResultId ?? null,
      appliedDeltas: deltas,
      reviewedAt: now.toISOString(),
      reviewedBy: userId,
    };

    const [row] = await tx
      .update(queuedTasks)
      .set({ result: { ...previousResult, review } })
      .where(eq(queuedTasks.id, queuedTaskId))
      .returning();

    return row;
  });

  if (!updated) {
    throw new GraphQLError("Could not save the decision review", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  publish(updated, correct ? "decision marked correct" : "decision corrected");
  const review = await getDecisionReviewContext(userId, queuedTaskId);

  return { queuedTask: updated, review };
}
