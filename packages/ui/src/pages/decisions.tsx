"use client";
import DecisionCard from "#components/decision/decisionCard";
import StateCard from "#components/decision/state/stateCard";
import { useState } from "react";

export default function LandingPage() {
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

  return (
    <div className="flex flex-row">
      <DecisionCard
        type={type}
        setValues={(values) => setValues(values)}
        setType={(type) => {
          setValues(undefined);
          setType(type);
        }}
      ></DecisionCard>
      <StateCard variables={values} type={type}></StateCard>
    </div>
  );
}
