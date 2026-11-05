"use client";
import { AuthGate } from "../components/auth/auth-gate";
import DecisionBuilder from "#components/decision/decisionBuilder";
import DecisionList from "#components/decision/decisionList/decisionList";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import { useState } from "react";

export default function DecisionPage() {
  return (
    <AuthGate>
      <DecisionPageContent />
    </AuthGate>
  );
}

function DecisionPageContent() {
  const [selectedDecisionId, setSelectedDecisionId] = useState<
    number | undefined
  >();

  return (
    <PageContainer>
      <PageHeader
        title="Decisions"
        description="Build and test the decisions used by your tasks."
      />
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full flex-col">
          <DecisionList
            setSelectedDecisionId={(decision) =>
              setSelectedDecisionId(decision)
            }
            selectedDecisionId={selectedDecisionId}
          />
        </div>
        <div className="flex w-full flex-col">
          <DecisionBuilder selectedDecisionId={selectedDecisionId} />
        </div>
      </div>
    </PageContainer>
  );
}
