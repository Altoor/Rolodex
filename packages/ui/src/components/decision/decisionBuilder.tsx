"use client";

import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useLazyQuery, useMutation } from "@apollo/client/react";
import DecisionCard from "./decisionCard/decisionCard";
import StateCard from "./state/stateCard";
import {
  DECISIONS,
  GET_DECISION,
} from "@repo/queries/decisions/decision-queries";
import {
  CREATE_SYSTEM_ONE_PROMPT,
  UPDATE_SYSTEM_ONE_PROMPT,
} from "@repo/queries/decisions/decision-mutations";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import {
  decisionFormValuesToVariables,
  decisionToFormValues,
  emptyDecisionFormValues,
  type DecisionFormValues,
} from "./decision-form";

interface DecisionBuilderProps {
  selectedDecisionId: number | undefined;
}

const DecisionBuilder = ({ selectedDecisionId }: DecisionBuilderProps) => {
  const methods = useForm<DecisionFormValues>({
    defaultValues: emptyDecisionFormValues,
  });
  const { handleSubmit, reset } = methods;
  const [getDecision, { loading, error: loadError }] =
    useLazyQuery(GET_DECISION);
  const [createDecision, { loading: creating, error: createError }] =
    useMutation(CREATE_SYSTEM_ONE_PROMPT, {
      refetchQueries: [DECISIONS],
      awaitRefetchQueries: true,
    });
  const [updateDecision, { loading: updating, error: updateError }] =
    useMutation(UPDATE_SYSTEM_ONE_PROMPT, {
      refetchQueries: [DECISIONS],
      awaitRefetchQueries: true,
    });

  useEffect(() => {
    let cancelled = false;

    if (selectedDecisionId === undefined) {
      reset(emptyDecisionFormValues);
      return () => {
        cancelled = true;
      };
    }

    void getDecision({ variables: { id: selectedDecisionId } }).then(
      ({ data }) => {
        if (cancelled || !data?.getDecision) return;

        reset(decisionToFormValues(data.getDecision));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [getDecision, reset, selectedDecisionId]);

  const saveDecision = handleSubmit(async (values) => {
    const variables = decisionFormValuesToVariables(values);

    if (selectedDecisionId !== undefined) {
      await updateDecision({
        variables: { ...variables, id: selectedDecisionId },
      });
    } else {
      await createDecision({ variables });
    }
  });

  if (selectedDecisionId !== undefined && loading) {
    return <LoadingState label="Loading decision…" />;
  }

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col gap-4">
        {loadError ? (
          <ErrorState title="Could not load decision" error={loadError} />
        ) : null}
        {createError || updateError ? (
          <ErrorState
            title="Could not save decision"
            error={createError ?? updateError}
          />
        ) : null}
        <DecisionCard save={saveDecision} saving={creating || updating} />
        <StateCard />
      </div>
    </FormProvider>
  );
};

export default DecisionBuilder;
