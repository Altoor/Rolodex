import { GraphQLError } from "graphql";
import { setRunStatus } from "../../queue/run-store";
import { runAssistedAttempt } from "../../queue/assisted-step";
import { resumeReviewedStep } from "../../queue/step-store";
import { supersedeAttempt } from "../attempts";
import { isValidDecisionPremise } from "../../schema/ai/decision-premise";
import { recordTrace } from "../infrastructure/trace";
import { loadReviewContext } from "./optimize-context";

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
