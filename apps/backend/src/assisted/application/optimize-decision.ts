import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { getModelForUser, getOllamaClient, getOllamaKeepAlive } from "@repo/ai";
import { db, stepAttempts } from "@repo/db";
import { setRunStatus } from "../../queue/run-store";
import { runAssistedAttempt } from "../../queue/assisted-step";
import { resumeReviewedStep } from "../../queue/step-store";
import { supersedeAttempt } from "../attempts";
import { preserveChoiceOptions } from "../domain/decision";
import { coerceDecisionPremise } from "../../schema/ai/decision-premise";
import { recordTrace } from "../infrastructure/trace";
import { loadReviewContext } from "./optimize-context";
import { buildOptimizationPrompt, stripFences } from "./optimize-prompt";

const MAX_OPTIMIZATION_ATTEMPTS = 3;

/**
 * Rewrites a decision's wording so the model is more likely to choose the
 * user's expected result, then re-runs it from the checkpoint. Changes remain
 * in the attempt snapshot until the step is accepted.
 */
export async function optimizeDecision(
  userId: number,
  attemptId: number,
  expectedResultId: number,
  feedback?: string,
) {
  const { attempt, run, step, snapshot } = await loadReviewContext(
    userId,
    attemptId,
  );

  const decision = snapshot.decision;
  if (!decision) {
    throw new GraphQLError("This attempt has no decision", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const expected = snapshot.results.find((row) => row.id === expectedResultId);
  if (!expected) {
    throw new GraphQLError("Expected result not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const previous = await db
    .select({ id: stepAttempts.id, cause: stepAttempts.cause })
    .from(stepAttempts)
    .where(eq(stepAttempts.queuedTaskId, step.id));
  const optimizationCount = previous.filter(
    (entry) => entry.cause === "optimizeDecision",
  ).length;

  if (optimizationCount >= MAX_OPTIMIZATION_ATTEMPTS) {
    throw new GraphQLError(
      `Optimization is limited to ${MAX_OPTIMIZATION_ATTEMPTS} attempts`,
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const prompt = buildOptimizationPrompt({
    expectedOption: String(
      expected.option ?? expected.scoreThreshold ?? expected.probabilityThreshold,
    ),
    decisionPremise: decision.decisionPremise,
    instruction: decision.instruction,
    options: decision.options,
    optionDescriptions: decision.optionDescriptions,
    feedback,
  });

  let next: {
    decisionPremise: string;
    instruction: string;
    options: string[];
    optionDescriptions: string[];
  };

  try {
    const model = await getModelForUser(userId);
    const ollama = await getOllamaClient();
    const keepAlive = await getOllamaKeepAlive();
    const response = await ollama.generate({
      model,
      prompt,
      format: "json",
      ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
    });
    const parsed = JSON.parse(stripFences(response.response ?? "")) as Record<
      string,
      unknown
    >;

    if (
      typeof parsed.decisionPremise !== "string" ||
      typeof parsed.instruction !== "string" ||
      !Array.isArray(parsed.options) ||
      !parsed.options.every((entry) => typeof entry === "string") ||
      !Array.isArray(parsed.optionDescriptions) ||
      !parsed.optionDescriptions.every((entry) => typeof entry === "string") ||
      parsed.options.length !== parsed.optionDescriptions.length
    ) {
      throw new Error("invalid optimization payload");
    }

    next = {
      decisionPremise: coerceDecisionPremise(
        parsed.decisionPremise,
        decision.decisionPremise,
      ),
      instruction: parsed.instruction,
      options: parsed.options as string[],
      optionDescriptions: parsed.optionDescriptions as string[],
    };
  } catch (err) {
    throw new GraphQLError(
      `Could not optimize the decision: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { extensions: { code: "BAD_MODEL_OUTPUT" } },
    );
  }

  // Choice options are matched to results by exact string. Never let an
  // optimized decision rename or add an option without corresponding result
  // wiring, or the model can pick an option that can never match.
  const keptOptions =
    decision.type === "choice"
      ? preserveChoiceOptions(
          decision.options,
          decision.optionDescriptions,
          next.options,
          next.optionDescriptions,
        )
      : {
          options: next.options,
          optionDescriptions: next.optionDescriptions,
        };

  const optimized = {
    ...decision,
    decisionPremise: next.decisionPremise,
    instruction: next.instruction,
    options: keptOptions.options,
    optionDescriptions: keptOptions.optionDescriptions,
  };

  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "decision.optimized",
    payload: {
      attempt: optimizationCount + 1,
      expectedResultId,
      decisionPremise: next.decisionPremise,
    },
  });

  await supersedeAttempt(attempt.id, "decision optimized");
  const resumed = await resumeReviewedStep(step.id);
  if (!resumed) {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await runAssistedAttempt(
    resumed,
    { ...snapshot, decision: optimized },
    {
      kind: "revision",
      cause: "optimizeDecision",
      revision: {
        kind: "optimizeDecision",
        expectedResultId,
        feedback: feedback ?? null,
      },
    },
  );

  await setRunStatus(run.id, "awaiting_decision_review");
  return run.id;
}

export { addDecisionOption, type NewDecisionOptionInput } from "./decision-option";
export { editDecisionWording, type DecisionWordingInput } from "./decision-wording";
