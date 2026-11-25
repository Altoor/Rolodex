import { GraphQLError } from "graphql";
import { setRunStatus } from "../../queue/run-store";
import { runAssistedAttempt } from "../../queue/assisted-step";
import { resumeReviewedStep } from "../../queue/step-store";
import { supersedeAttempt, type TaskSnapshot } from "../attempts";
import { recordTrace } from "../infrastructure/trace";
import { loadReviewContext } from "./optimize-context";

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
