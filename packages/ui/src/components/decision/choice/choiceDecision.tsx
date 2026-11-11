"use client";

import DecisionFields from "../form/decisionFields";
import DecisionOptions from "../form/decisionOptions";

const ChoiceDecisionForm = () => (
  <div className="flex flex-col gap-4">
    <DecisionFields idPrefix="choice" />
    <DecisionOptions idPrefix="choice" withDescriptions />
  </div>
);

export default ChoiceDecisionForm;
