"use client";
import DecisionBuilder from "#components/decision/decisionBuilder";
import DecisionList from "#components/decision/decisionList/decisionList";
import { useState } from "react";

export default function DecisionPage() {
  const [selectedDecisionId, setSelectedDecisionId] = useState<
    number | undefined
  >(undefined);

  return (
    <div className="flex flex-row gap-4 m-4">
      <div className="flex flex-col w-full ">
        <DecisionList
          setSelectedDecisionId={(decision) => setSelectedDecisionId(decision)}
          selectedDecisionId={selectedDecisionId}
        />
      </div>
      <div className="flex flex-col w-full">
        <DecisionBuilder selectedDecisionId={selectedDecisionId} />
      </div>
    </div>
  );
}
