"use client";

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
import { useLoadedEntity } from "#hooks/useLoadedEntity";
import { useSaveEntity } from "#hooks/useSaveEntity";
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
  const { reset } = methods;

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

  useLoadedEntity({
    id: selectedDecisionId,
    load: async (id) =>
      (await getDecision({ variables: { id } })).data?.getDecision,
    onLoaded: (decision) =>
      reset(
        decision ? decisionToFormValues(decision) : emptyDecisionFormValues,
      ),
  });

  const saveDecision = useSaveEntity({
    form: methods,
    id: selectedDecisionId,
    toVariables: decisionFormValuesToVariables,
    create: (variables) => createDecision({ variables }),
    update: (variables) => updateDecision({ variables }),
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
