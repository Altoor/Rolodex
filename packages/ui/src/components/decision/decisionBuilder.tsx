"use client";

import { useEffect, useState } from "react";
import DecisionCard from "./decisionCard";
import StateCard from "./state/stateCard";
import { GET_DECISION } from "@repo/queries/decisions/decision-queries";
import { useLazyQuery } from "@apollo/client/react";
import { Spinner } from "#components/ui/spinner";

interface DecisionBuilderProps {
  selectedDecisionId: number | undefined;
}

const DecisionBuilder = ({ selectedDecisionId }: DecisionBuilderProps) => {
  const [getDecision, { loading, error, data }] = useLazyQuery(GET_DECISION);

  const [values, setValues] = useState<
    | {
        decisionPremise: string;
        instruction: string;
        options?: Array<string> | string | null | undefined;
        optionDescriptions?: Array<string> | string | null | undefined;
      }
    | undefined
  >(undefined);
  const [type, setType] = useState<"noul" | "choice" | "score">("noul");

  useEffect(() => {
    if (selectedDecisionId !== undefined) {
      const getValues = async () => {
        const decision = await getDecision({
          variables: { id: selectedDecisionId },
        });

        if (decision.data?.getDecision) {
          setValues({
            decisionPremise: decision.data?.getDecision.decisionPremise ?? "",
            instruction: decision.data?.getDecision.instruction ?? "",
            options: decision.data?.getDecision.options,
            optionDescriptions: decision.data?.getDecision.optionDescriptions,
          });
        } else {
          console.error("something happened");
        }
      };

      getValues();
    }
  }, [getDecision, selectedDecisionId]);

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <Spinner />
      ) : (
        <>
          <DecisionCard
            type={type}
            setValues={(values) => setValues(values)}
            setType={(type) => {
              setValues(undefined);
              setType(type);
            }}
            values={values}
          ></DecisionCard>
          <StateCard variables={values} type={type}></StateCard>
        </>
      )}
    </div>
  );
};

export default DecisionBuilder;
