"use client";

import { useState } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { useFormContext } from "react-hook-form";
import { SYSTEM_ONE_PROMPT } from "@repo/queries/decisions/decision-queries";
import {
  decisionFormValuesToVariables,
  type DecisionFormValues,
} from "../decision-form";
import { readSystemOneAnswer } from "../decision-answer";

/** Runs the decision prompt against the current form values. */
export function useSystemOnePreview() {
  const { getValues } = useFormContext<DecisionFormValues>();
  const [prompt, { loading, error, data }] = useLazyQuery(SYSTEM_ONE_PROMPT);
  const [decisionPremise, setDecisionPremise] = useState("");

  const run = (state: string) => {
    const variables = decisionFormValuesToVariables(getValues());
    setDecisionPremise(variables.decisionPremise);

    void prompt({ variables: { ...variables, state } });
  };

  return {
    run,
    loading,
    error,
    decisionPremise,
    answer: readSystemOneAnswer(data?.systemOnePrompt?.answer, decisionPremise),
  };
}
