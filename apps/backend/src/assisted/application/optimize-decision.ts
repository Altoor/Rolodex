import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { getModelForUser, getOllamaClient, getOllamaKeepAlive } from "@repo/ai";
import { db, stepAttempts } from "@repo/db";
import { getRun, setRunStatus } from "../../queue/run-store";
import { runAssistedAttempt } from "../../queue/assisted-step";
import { resumeReviewedStep } from "../../queue/step-store";
import {
  getAttempt,
  isLatestAttempt,
  supersedeAttempt,
  type TaskSnapshot,
} from "../attempts";
import { preserveChoiceOptions } from "../domain/decision";
import {
  coerceDecisionPremise,
  isValidDecisionPremise,
} from "../../schema/ai/decision-premise";
import { recordTrace } from "../infrastructure/trace";

const MAX_OPTIMIZATION_ATTEMPTS = 3;

function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match?.[1] ?? trimmed;
}

async function loadReviewContext(userId: number, attemptId: number) {
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

  return { attempt, run, step, snapshot: attempt.taskSnapshot as unknown as TaskSnapshot };
}

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

  const prompt = [
    "Rewrite a decision prompt so a System One model chooses the expected option.",
    "Return ONLY JSON: { decisionPremise, instruction, options, optionDescriptions }.",
    "Rules:",
    "- decisionPremise must be ONE word, or at most TWO words. It is a short key, not a question or sentence. Examples: approve, vendor, invoice_status.",
    "- Never return a premise with punctuation or more than two words.",
    "- Return the SAME options array, in the same order, with the exact same strings.",
    "- Do not rename, remove, or add options; only improve their descriptions.",
    "- options and optionDescriptions must have the same length.",
    "- Do not weaken safety or invent facts.",
    `Expected option: ${expected.option ?? expected.scoreThreshold ?? expected.probabilityThreshold}`,
    `Current premise: ${decision.decisionPremise}`,
    `Current instruction: ${decision.instruction}`,
    `Current options: ${JSON.stringify(decision.options ?? [])}`,
    `Current descriptions: ${JSON.stringify(decision.optionDescriptions ?? [])}`,
    feedback ? `User note: ${feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n");

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

export interface DecisionWordingInput {
  decisionPremise: string;
  instruction: string;
  optionDescriptions?: string[] | null;
}

/**
 * Lets the user apply their own wording after the optimizer has been used up
 * (or instead of calling the model). Options keep their exact strings so
 * choice results stay wired; only descriptions, premise, and instruction
 * change.
 */
export async function editDecisionWording(
  userId: number,
  attemptId: number,
  input: DecisionWordingInput,
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

  const premise = input.decisionPremise.trim();
  const instruction = input.instruction.trim();
  if (!premise || !instruction) {
    throw new GraphQLError("The premise and instruction cannot be empty", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  if (!isValidDecisionPremise(premise)) {
    throw new GraphQLError(
      "The decision premise must be one word, or at most two.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const options = decision.options ?? [];
  const descriptions = input.optionDescriptions;
  if (descriptions != null && descriptions.length !== options.length) {
    throw new GraphQLError(
      "Provide one description for each decision option",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const edited = {
    ...decision,
    decisionPremise: premise,
    instruction,
    optionDescriptions:
      descriptions?.map((entry) => entry.trim()) ??
      decision.optionDescriptions,
  };

  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "decision.wordingEdited",
    payload: { decisionPremise: premise },
  });

  await supersedeAttempt(attempt.id, "decision wording edited");
  const resumed = await resumeReviewedStep(step.id);
  if (!resumed) {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await runAssistedAttempt(
    resumed,
    { ...snapshot, decision: edited },
    {
      kind: "revision",
      cause: "editDecisionWording",
      revision: { kind: "editDecisionWording" },
    },
  );

  await setRunStatus(run.id, "awaiting_decision_review");
  return run.id;
}

export interface NewDecisionOptionInput {
  label: string;
  description?: string | null;
  value?: string | null;
  targetTaskId?: number | null;
}

/** Adds a new decision option to the snapshot and re-runs the decision. */
export async function addDecisionOption(
  userId: number,
  attemptId: number,
  input: NewDecisionOptionInput,
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

  if (!input.label.trim()) {
    throw new GraphQLError("The option needs a label", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const optionValue = input.value?.trim() || input.label.trim();
  const options = [...(decision.options ?? [])];
  const descriptions = [...(decision.optionDescriptions ?? [])];

  if (!options.includes(optionValue)) {
    options.push(optionValue);
    descriptions.push(input.description ?? "");
  }

  const newResult = {
    id: -Date.now(),
    taskId: snapshot.task.id,
    type: decision.type,
    option: decision.type === "choice" ? optionValue : null,
    scoreThreshold:
      decision.type === "score" ? Number(optionValue) || 0 : null,
    probabilityThreshold:
      decision.type === "noul" ? Number(optionValue) || 0.8 : null,
    confidenceThreshold: null,
    resultTaskId: input.targetTaskId ?? null,
    appendState: true,
  };

  const nextSnapshot: TaskSnapshot = {
    ...snapshot,
    decision: {
      ...decision,
      options,
      optionDescriptions: descriptions,
    },
    results: [...snapshot.results, newResult as TaskSnapshot["results"][number]],
  };

  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "decision.optionAdded",
    payload: { label: optionValue, targetTaskId: input.targetTaskId ?? null },
  });

  await supersedeAttempt(attempt.id, "new decision option added");
  const resumed = await resumeReviewedStep(step.id);
  if (!resumed) {
    throw new GraphQLError("This attempt is not waiting for review", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await runAssistedAttempt(resumed, nextSnapshot, {
    kind: "revision",
    cause: "addDecisionOption",
    revision: { kind: "addDecisionOption", option: optionValue },
  });

  await setRunStatus(run.id, "awaiting_decision_review");
  return run.id;
}
