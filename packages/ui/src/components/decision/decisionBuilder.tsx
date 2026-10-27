"use client";

import { useEffect, useState } from "react";
import DecisionCard from "./decisionCard";
import StateCard from "./state/stateCard";
import {
  DECISIONS,
  GET_DECISION,
} from "@repo/queries/decisions/decision-queries";
import { useLazyQuery, useMutation } from "@apollo/client/react";
import { Spinner } from "#components/ui/spinner";
import {
  CREATE_SYSTEM_ONE_PROMPT,
  UPDATE_SYSTEM_ONE_PROMPT,
} from "@repo/queries/decisions/decision-mutations";
import { DecisionType } from "@repo/queries/__generated__/graphql";

interface DecisionBuilderProps {
  selectedDecisionId: number | undefined;
}

const DecisionBuilder = ({ selectedDecisionId }: DecisionBuilderProps) => {
  const [getDecision, { loading, error, client }] = useLazyQuery(GET_DECISION);
  const [
    createDecision,
    { loading: createDecisionLoading, error: createDecisionError },
  ] = useMutation(CREATE_SYSTEM_ONE_PROMPT);
  const [
    updateDecision,
    { loading: updateDecisionLoading, error: updateDecisionError },
  ] = useMutation(UPDATE_SYSTEM_ONE_PROMPT);

  const [formValues, setFormValues] = useState<
    | {
        decisionPremise: string;
        instruction: string;
        options?: Array<string>;
        optionDescriptions?: Array<string>;
        name: string;
      }
    | undefined
  >(undefined);

  const [loadedValues, setLoadedValues] = useState<
    | {
        decisionPremise: string;
        instruction: string;
        options?: Array<string>;
        optionDescriptions?: Array<string>;
        name: string;
      }
    | undefined
  >(undefined);
  const [type, setType] = useState<DecisionType>("noul");

  useEffect(() => {
    if (selectedDecisionId !== undefined) {
      const getValues = async () => {
        const decision = await getDecision({
          variables: { id: selectedDecisionId },
        });

        if (decision.data?.getDecision) {
          setLoadedValues({
            decisionPremise: decision.data?.getDecision.decisionPremise ?? "",
            instruction: decision.data?.getDecision.instruction ?? "",
            options: decision.data?.getDecision.options as string[] | undefined,
            optionDescriptions: decision.data?.getDecision
              .optionDescriptions as string[] | undefined,
            name: decision.data?.getDecision.name ?? "",
          });

          setType((decision.data.getDecision.type as DecisionType) ?? "noul");
        } else {
          console.error("something happened");
        }
      };

      getValues();
    } else {
      setLoadedValues({
        name: "",
        instruction: "",
        decisionPremise: "",
        options: undefined,
        optionDescriptions: undefined,
      });
      setType("noul");
    }
  }, [getDecision, selectedDecisionId]);

  const saveDecision = (value: {
    decisionPremise: string;
    instruction: string;
    type: DecisionType;
    name: string;
    options?: Array<string>;
    optionDescriptions?: Array<string>;
  }) => {
    if (selectedDecisionId) {
      updateDecision({ variables: { ...value, id: selectedDecisionId } });
    } else {
      createDecision({ variables: { ...value } });
    }

    client.refetchQueries({
      include: [DECISIONS],
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <Spinner />
      ) : (
        <>
          <DecisionCard
            type={type}
            setValues={(values) => {
              console.log(values);
              setFormValues(values);
            }}
            setType={(type) => {
              setFormValues(undefined);
              setType(type);
            }}
            values={loadedValues}
            save={() => {
              if (formValues) {
                saveDecision({ ...formValues, type: type });
              }
            }}
          ></DecisionCard>
          <StateCard variables={formValues} type={type}></StateCard>
        </>
      )}
    </div>
  );
};

export default DecisionBuilder;
