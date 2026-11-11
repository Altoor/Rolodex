"use client";

import DecisionFields from "../form/decisionFields";
import DecisionOptions from "../form/decisionOptions";

const ScoreDecisionForm = () => (
  <div className="flex flex-col gap-4">
    <DecisionFields idPrefix="score" />
    <DecisionOptions idPrefix="score" />
  </div>
);

export default ScoreDecisionForm;
